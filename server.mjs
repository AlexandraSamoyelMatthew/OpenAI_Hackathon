import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const envFile = await readFile('.env', 'utf8').catch(() => '');
for (const line of envFile.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
}

const port = Number(process.env.PORT || 3020);
const publicDir = join(process.cwd(), 'public');
const MAX_CODE_LENGTH = 30_000;

const reviewSchema = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'findings'],
  properties: {
    summary: { type: 'string' },
    findings: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        required: ['finding_kind', 'severity', 'category', 'line_reference', 'title', 'problem', 'why_current_behavior', 'security_impact', 'owasp_concept', 'teaching_explanation', 'better_approach', 'recommended_fix', 'improved_example', 'best_practices', 'attacker_advantage', 'learning_explanation'],
        properties: {
          finding_kind: { type: 'string', enum: ['security', 'code_quality'] },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          category: { type: 'string' }, line_reference: { type: 'string' }, title: { type: 'string' }, problem: { type: 'string' },
          why_current_behavior: { type: 'string' }, security_impact: { type: 'string' }, owasp_concept: { type: 'string' },
          teaching_explanation: { type: 'string' }, better_approach: { type: 'string' }, recommended_fix: { type: 'string' },
          improved_example: { type: 'string' }, best_practices: { type: 'string' }, attacker_advantage: { type: 'string' }, learning_explanation: { type: 'string' }
        }
      }
    }
  }
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type.includes('json') ? JSON.stringify(body) : body);
}

class ReviewServiceError extends Error {
  constructor({ status = 502, category, message, requestId = null }) {
    super(message);
    this.status = status;
    this.category = category;
    this.requestId = requestId;
  }
}

function logOpenAIError({ status, type, code, message, requestId }) {
  // Deliberately log only OpenAI response metadata. Never log request headers, body, or API keys.
  console.error('[alexos.openai_error]', JSON.stringify({
    http_status: status ?? null,
    error_type: type ?? 'unknown_error',
    error_code: code ?? 'unknown_error',
    message: message ?? 'No error message returned.',
    request_id: requestId ?? null
  }));
}

function safeOpenAIMessage({ status, type, code, message }) {
  const normalized = `${type || ''} ${code || ''} ${message || ''}`.toLowerCase();
  if (status === 401 || normalized.includes('invalid_api_key') || normalized.includes('incorrect api key')) {
    return { status: 401, category: 'invalid_api_key', message: 'OpenAI rejected the API key. Check OPENAI_API_KEY, then restart the server.' };
  }
  if (status === 429 && (normalized.includes('insufficient_quota') || normalized.includes('quota'))) {
    return { status: 429, category: 'insufficient_quota', message: 'OpenAI account quota or billing is unavailable for this request. Check your project billing and limits.' };
  }
  if (status === 404 || normalized.includes('model_not_found') || normalized.includes('does not exist') || normalized.includes('not have access to model')) {
    return { status: 424, category: 'unavailable_model', message: 'The configured OpenAI model is unavailable to this API key. Set OPENAI_MODEL to a model your project can use.' };
  }
  if (normalized.includes('json_schema') || normalized.includes('structured output') || normalized.includes('schema')) {
    return { status: 502, category: 'malformed_structured_output', message: 'OpenAI could not produce the review in the required format. Please retry; if it persists, check the review schema and model compatibility.' };
  }
  if (status === 408 || status === 409 || status === 429 || (status >= 500 && status <= 599)) {
    return { status: 503, category: 'temporary_openai_error', message: 'OpenAI is temporarily unavailable or busy. Please retry in a moment.' };
  }
  return { status: 502, category: 'openai_request_error', message: 'OpenAI could not complete this review. Check the server log using the request reference, then retry.' };
}

const findingFields = ['finding_kind', 'severity', 'category', 'line_reference', 'title', 'problem', 'why_current_behavior', 'security_impact', 'owasp_concept', 'teaching_explanation', 'better_approach', 'recommended_fix', 'improved_example', 'best_practices', 'attacker_advantage', 'learning_explanation'];
const securityRequiredFields = ['finding_kind', 'severity', 'category', 'line_reference', 'title', 'problem', 'security_impact', 'owasp_concept', 'teaching_explanation', 'recommended_fix', 'attacker_advantage', 'learning_explanation'];
const codeQualityRequiredFields = ['finding_kind', 'severity', 'category', 'line_reference', 'title', 'problem', 'why_current_behavior', 'better_approach', 'improved_example', 'best_practices', 'learning_explanation'];

function logStructuredOutput({ responseStatus, completionStatus, missingFields, validationErrors, requestId }) {
  // Do not log user code or the raw model response. These fields are enough to diagnose the contract.
  console.error('[alexos.structured_output]', JSON.stringify({
    response_status: responseStatus ?? null,
    completion_status: completionStatus ?? 'unknown',
    missing_fields: missingFields,
    validation_errors: validationErrors,
    request_id: requestId ?? null
  }));
}

function extractResponseText(payload) {
  // `output_text` is supplied by some SDK helpers. The raw Responses REST payload stores it in output[].content[].
  if (typeof payload?.output_text === 'string') return payload.output_text;
  for (const outputItem of payload?.output || []) {
    for (const contentItem of outputItem?.content || []) {
      if (contentItem?.type === 'output_text' && typeof contentItem.text === 'string') return contentItem.text;
    }
  }
  return null;
}

function normalizeAndValidateReview(parsed) {
  const missingFields = [];
  const validationErrors = [];
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { review: null, missingFields: ['review'], validationErrors: ['Review must be a JSON object.'] };
  }
  if (typeof parsed.summary !== 'string') missingFields.push('summary');
  if (!Array.isArray(parsed.findings)) missingFields.push('findings');
  if (missingFields.length) return { review: null, missingFields, validationErrors };

  const normalizedFindings = [];
  parsed.findings.forEach((rawFinding, index) => {
    const prefix = `findings[${index}]`;
    if (!rawFinding || typeof rawFinding !== 'object' || Array.isArray(rawFinding)) {
      validationErrors.push(`${prefix} must be an object.`);
      return;
    }
    const finding = { ...rawFinding };
    const required = finding.finding_kind === 'security' ? securityRequiredFields : finding.finding_kind === 'code_quality' ? codeQualityRequiredFields : [];
    if (!required.length) validationErrors.push(`${prefix}.finding_kind must be security or code_quality.`);
    for (const field of required) {
      if (typeof finding[field] !== 'string' || !finding[field].trim()) missingFields.push(`${prefix}.${field}`);
    }
    if (!['critical', 'high', 'medium', 'low'].includes(finding.severity)) validationErrors.push(`${prefix}.severity must be critical, high, medium, or low.`);

    // The strict schema asks the model for every field. These defaults preserve a usable lesson if an irrelevant field is absent.
    for (const field of findingFields) {
      if (typeof finding[field] !== 'string' || !finding[field].trim()) finding[field] = 'Not applicable';
    }
    normalizedFindings.push(finding);
  });
  if (missingFields.length || validationErrors.length) return { review: null, missingFields, validationErrors };
  return { review: { summary: parsed.summary, findings: normalizedFindings }, missingFields: [], validationErrors: [] };
}

async function bodyJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > MAX_CODE_LENGTH + 1024) throw new Error('Request body is too large.');
  }
  try { return JSON.parse(data); } catch { throw new Error('Send a valid JSON request.'); }
}

function demoReview(code) {
  const findings = [];
  const lineOf = (needle) => {
    const index = code.indexOf(needle);
    return index < 0 ? 'Review recommendation' : `Line ${code.slice(0, index).split('\n').length}`;
  };
  if (/SELECT|INSERT|UPDATE|DELETE/i.test(code) && /\$\{|\+/.test(code)) findings.push({
    severity: 'high', type: 'Security · CWE-89', line_reference: lineOf('SELECT'), issue: 'Possible SQL injection',
    why_it_matters: 'User-controlled values appear to be composed into a SQL statement, which can let an attacker change the query.',
    fix: 'const query = "SELECT * FROM users WHERE user = ? AND pass = ?";\nreturn db.execute(query, [user, pass]);',
    fix_explanation: 'Parameterized queries keep values separate from SQL instructions.'
  });
  if (/\b(password|api[_-]?key|secret|token)\s*[=:]\s*['"][^'"]{4,}/i.test(code)) findings.push({
    severity: 'high', type: 'Security · CWE-798', line_reference: lineOf('password'), issue: 'Hardcoded credential or secret',
    why_it_matters: 'Secrets committed to source code can be copied, leaked through logs or version history, and reused by an attacker.',
    fix: 'const apiKey = process.env.API_KEY;\nif (!apiKey) throw new Error("API_KEY is required");',
    fix_explanation: 'Load secrets from protected environment configuration and rotate any secret already committed.'
  });
  if (/pass(word)?\s*[=:]/i.test(code)) findings.push({
    severity: 'medium', type: 'Security · CWE-256', line_reference: lineOf('pass'), issue: 'Avoid storing or comparing raw passwords',
    why_it_matters: 'A database leak exposes raw passwords and encourages insecure authentication handling.',
    fix: 'const valid = await argon2.verify(user.passwordHash, pass);',
    fix_explanation: 'Store a slow password hash and verify it with a vetted library.'
  });
  if (/\beval\s*\(/.test(code) || /new\s+Function\s*\(/.test(code)) findings.push({
    severity: 'high', type: 'Security · CWE-95', line_reference: lineOf('eval'), issue: 'Dynamic code execution',
    why_it_matters: 'Executing a string as code can let untrusted input run with your application’s permissions.',
    fix: 'const value = JSON.parse(input); // parse data instead of executing it',
    fix_explanation: 'Use a parser or an explicit allow-list instead of evaluating dynamic code.'
  });
  if (/\b(innerHTML|outerHTML)\s*=/.test(code)) findings.push({
    severity: 'medium', type: 'Security · CWE-79', line_reference: lineOf('innerHTML'), issue: 'Potential cross-site scripting (XSS)',
    why_it_matters: 'Assigning dynamic content to HTML can turn attacker-controlled text into executable markup.',
    fix: 'element.textContent = userSuppliedText;',
    fix_explanation: 'Use textContent for plain text; sanitize any intentionally supported HTML with a vetted library.'
  });
  if (/child_process|\bexec\s*\(/.test(code) && /\$\{|\+/.test(code)) findings.push({
    severity: 'critical', type: 'Security · CWE-78', line_reference: lineOf('exec'), issue: 'Possible OS command injection',
    why_it_matters: 'Building shell commands with external input can allow arbitrary commands to run on the server.',
    fix: 'spawn("tool", [validatedArgument], { shell: false });',
    fix_explanation: 'Avoid shell invocation, validate input against an allow-list, and pass arguments as an array.'
  });
  if (/Math\.random\s*\(/.test(code) && /(token|secret|password|reset|auth)/i.test(code)) findings.push({
    severity: 'medium', type: 'Security · CWE-338', line_reference: lineOf('Math.random'), issue: 'Weak randomness for a security-sensitive value',
    why_it_matters: 'Math.random is not designed for secrets or authentication tokens and may be predictable.',
    fix: 'const token = crypto.randomUUID(); // or crypto.randomBytes(32).toString("hex")',
    fix_explanation: 'Use the platform cryptographic random generator for tokens and secrets.'
  });
  if (!findings.length) findings.push({
    severity: 'low', type: 'best practice', line_reference: 'Whole file', issue: 'Demo review completed',
    why_it_matters: 'This offline demo mode only detects a few common code and security patterns.',
    fix: 'Add OPENAI_API_KEY to .env for a full AI review.',
    fix_explanation: 'Live mode returns a contextual review of the code you submit.'
  });
  const lessons = findings.map((finding) => {
    const isSecurity = finding.type.startsWith('Security');
    const cwe = finding.type.match(/CWE-\d+/)?.[0];
    const owaspByCwe = {
      'CWE-89': 'OWASP Top 10 (2021) A03: Injection — SQL injection.',
      'CWE-798': 'OWASP Top 10 (2021) A07: Identification and Authentication Failures — hardcoded credentials.',
      'CWE-256': 'OWASP Top 10 (2021) A07: Identification and Authentication Failures — insecure password handling.',
      'CWE-95': 'OWASP Top 10 (2021) A03: Injection — code injection.',
      'CWE-79': 'OWASP Top 10 (2021) A03: Injection — cross-site scripting.',
      'CWE-78': 'OWASP Top 10 (2021) A03: Injection — OS command injection.',
      'CWE-338': 'OWASP Top 10 (2021) A02: Cryptographic Failures — weak randomness.'
    };
    return {
      finding_kind: isSecurity ? 'security' : 'code_quality', severity: finding.severity,
      category: finding.type, line_reference: finding.line_reference, title: finding.issue, problem: finding.issue,
      why_current_behavior: finding.why_it_matters,
      security_impact: isSecurity ? finding.why_it_matters : 'Not a security-specific finding.',
      owasp_concept: isSecurity ? (owaspByCwe[cwe] || 'Relevant OWASP concept — verify the final classification in your application context.') : 'Not applicable.',
      teaching_explanation: finding.fix_explanation,
      better_approach: finding.fix_explanation,
      recommended_fix: finding.fix, improved_example: finding.fix,
      best_practices: 'Keep sensitive configuration out of source code, validate external input, and add a focused regression test.',
      attacker_advantage: isSecurity ? 'Attackers look for predictable patterns, untrusted input, or exposed secrets because they can turn a small coding shortcut into unauthorized access.' : 'Not applicable.',
      learning_explanation: finding.fix_explanation
    };
  });
  return { summary: `Demo mentor review found ${lessons.length} lesson${lessons.length === 1 ? '' : 's'}. Add an API key for a contextual AI review.`, findings: lessons };
}

async function aiReview(code) {
  if (!process.env.OPENAI_API_KEY) return demoReview(code);
  let response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: [
          { role: 'system', content: 'You are Alex.OS, an educational AI mentor for developers and cybersecurity learners. Review only the supplied code and return at most 8 important findings. Classify each as security or code_quality. For security findings, teach in this sequence: problem, security impact, relevant OWASP concept when applicable, teaching explanation, recommended fix, and why attackers exploit it. For non-security findings, teach: problem, why current behavior occurs, better approach, improved example, best practices, and learning explanation. Prioritize authentication, secrets, injection, unsafe deserialization, XSS, authorization, cryptography misuse, and input validation when relevant. Use a precise CWE label in category when known. Be constructive, concise, and explicit about uncertainty. Never execute the code or give instructions enabling wrongdoing; focus on defensive explanations and safe fixes.' },
          { role: 'user', content: `Review this code:\n\n${code}` }
        ],
        max_output_tokens: 4000,
        text: { format: { type: 'json_schema', name: 'code_review', strict: true, schema: reviewSchema } }
      })
    });
  } catch (error) {
    logOpenAIError({ status: null, type: 'network_error', code: error?.cause?.code || error?.code, message: error?.message, requestId: null });
    throw new ReviewServiceError({ status: 503, category: 'temporary_openai_error', message: 'Could not reach OpenAI. Check your network connection and retry.' });
  }

  const requestId = response.headers.get('x-request-id');
  const rawPayload = await response.text();
  let payload;
  try { payload = JSON.parse(rawPayload); } catch { payload = null; }

  if (!response.ok) {
    const details = {
      status: response.status,
      type: payload?.error?.type,
      code: payload?.error?.code,
      message: payload?.error?.message || `OpenAI returned HTTP ${response.status}.`,
      requestId: requestId || payload?.request_id || payload?.error?.request_id
    };
    logOpenAIError(details);
    const safe = safeOpenAIMessage(details);
    throw new ReviewServiceError({ ...safe, requestId: details.requestId });
  }

  const completionStatus = payload?.status || 'unknown';
  const outputText = extractResponseText(payload);
  if (completionStatus !== 'completed' || !outputText) {
    const validationErrors = completionStatus !== 'completed' ? [`Responses completion status: ${completionStatus}.`] : [];
    logStructuredOutput({ responseStatus: response.status, completionStatus, missingFields: outputText ? [] : ['output[].content[].text'], validationErrors, requestId });
    throw new ReviewServiceError({ category: 'malformed_structured_output', message: 'OpenAI did not complete a usable review response. Please retry.', requestId });
  }

  let parsed;
  try { parsed = JSON.parse(outputText); }
  catch {
    logStructuredOutput({ responseStatus: response.status, completionStatus, missingFields: [], validationErrors: ['The model output was not valid JSON.'], requestId });
    throw new ReviewServiceError({ category: 'malformed_structured_output', message: 'OpenAI returned a review that could not be read. Please retry.', requestId });
  }
  const validation = normalizeAndValidateReview(parsed);
  if (!validation.review) {
    logStructuredOutput({ responseStatus: response.status, completionStatus, missingFields: validation.missingFields, validationErrors: validation.validationErrors, requestId });
    throw new ReviewServiceError({ category: 'malformed_structured_output', message: 'OpenAI returned a review missing required mentor fields. Please retry.', requestId });
  }
  return validation.review;
}

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/review') {
    try {
      const { code } = await bodyJson(req);
      if (typeof code !== 'string' || !code.trim()) return send(res, 400, { error: 'Paste some code first.' });
      if (code.length > MAX_CODE_LENGTH) return send(res, 413, { error: `Keep code under ${MAX_CODE_LENGTH.toLocaleString()} characters.` });
      return send(res, 200, await aiReview(code));
    } catch (error) {
      if (error instanceof ReviewServiceError) {
        return send(res, error.status, { error: error.message, error_code: error.category, request_id: error.requestId });
      }
      console.error('[alexos.review_error]', error?.message || 'Unknown review error');
      return send(res, 500, { error: 'The review service encountered an unexpected error. Check the server log and retry.', error_code: 'internal_error', request_id: null });
    }
  }
  if (req.method === 'GET') {
    const requested = req.url === '/' ? 'index.html' : req.url.split('?')[0].replace(/^\/+/, '');
    const file = normalize(join(publicDir, requested));
    if (file !== publicDir && !file.startsWith(`${publicDir}${sep}`)) return send(res, 403, { error: 'Forbidden' });
    try { return send(res, 200, await readFile(file), types[extname(file)] || 'application/octet-stream'); }
    catch { return send(res, 404, { error: 'Not found' }); }
  }
  send(res, 405, { error: 'Method not allowed' });
});
server.listen(port, () => console.log(`Alex.OS is running at http://localhost:${port}`));
