import fs from 'fs';
import https from 'https';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

const API_BASE_URL = process.env.TOSS_API_BASE_URL;

// Environment variables should be accessed via process.env
// Ensure these are available in your function configuration

export const getHttpsAgent = () => {
  // Load Certificates first
  let cert, key;

  // 1. Firebase Secrets / Environment Variables (Cloud Functions)
  const certPem = process.env.TOSS_CERT_PEM;
  const keyPem = process.env.TOSS_KEY_PEM;

  if (certPem && keyPem) {
    // Replace literal "\n" with actual newlines if necessary
    cert = certPem.replace(/\\n/g, '\n');
    key = keyPem.replace(/\\n/g, '\n');
  } else {
    // 2. Local Development (File Paths)
    const certPath = process.env.TOSS_CERT_PATH;
    const keyPath = process.env.TOSS_KEY_PATH;
    if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      cert = fs.readFileSync(certPath);
      key = fs.readFileSync(keyPath);
    }
  }

  const agentOptions = {};
  if (cert && key) {
    agentOptions.cert = cert;
    agentOptions.key = key;
    console.log('[TossClient] Certificates loaded successfully.');
  } else {
    console.warn('[TossClient] No certificates found! Toss API request may fail (mTLS required).');
    if (!process.env.TOSS_CERT_PEM) {
      console.log('[TossClient] Checked paths:', {
        certPath: process.env.TOSS_CERT_PATH,
        keyPath: process.env.TOSS_KEY_PATH
      });
    }
  }

  // Check for Proxy
  const proxyUrl = process.env.HTTPS_PROXY || process.env.TOSS_PROXY_URL;

  if (proxyUrl) {
    console.log('[TossClient] Using explicitly configured proxy.');
    return new HttpsProxyAgent(proxyUrl, agentOptions);
  }

  // Fallback to standard agent if certs enable it
  if (cert && key) {
    return new https.Agent(agentOptions);
  }

  return undefined;
};

export const resolveTossUrl = (urlOrPath) => {
  if (!urlOrPath) return null;
  if (!API_BASE_URL) throw new Error('Set TOSS_API_BASE_URL explicitly for your own integration.');
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
  const normalizedPath = urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

export const getTossBasicAuthHeader = () => {
  const clientId = process.env.TOSS_CLIENT_ID || process.env.CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET || process.env.CLIENT_SECRET;
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
};

export const forwardToToss = async ({ url, payload, method = 'POST' }) => {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': getTossBasicAuthHeader()
  };

  // If payload has x-toss-user-key, usually it's passed as a header in Toss API
  // But verify specific API requirements. 
  // For Push API, documents say X-Toss-User-Key header is required.
  // We can support passing extra headers if needed.

  const response = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(payload ?? {}) : undefined,
    agent: getHttpsAgent()
  });

  const text = await response.text();
  const contentType = response.headers.get('content-type') || '';
  let json = null;
  if (contentType.includes('application/json')) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  return {
    status: response.status,
    contentType,
    text,
    json
  };
};

/**
 * Send Push Notification to a user
 * @param {string} userKey 
 * @param {string} templateSetCode 
 * @param {object} context 
 */
export const sendPushMessage = async (userKey, templateSetCode, context = {}) => {
  const url = resolveTossUrl('/api-partner/v1/apps-in-toss/messenger/send-message');
  const clientId = process.env.TOSS_CLIENT_ID || process.env.CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET || process.env.CLIENT_SECRET;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const payload = {
    templateSetCode: templateSetCode || 'default_template', // Ensure it is never null/undefined
    context: context || {}
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credentials}`,
      'X-Toss-User-Key': String(userKey) // Ensure it is a string
    },
    body: JSON.stringify(payload),
    agent: getHttpsAgent()
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Push Failed for ${userKey}: ${response.status} ${text}`);
    return { success: false, status: response.status, error: text };
  }

  const json = await response.json();
  return { success: true, data: json };
};
/**
 * Obtain Promotion Key
 */
export const getPromotionKey = async (userKey) => {
  const url = resolveTossUrl('/api-partner/v1/apps-in-toss/promotion/execute-promotion/get-key');
  const clientId = process.env.TOSS_CLIENT_ID || process.env.CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET || process.env.CLIENT_SECRET;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credentials}`,
      'x-toss-user-key': userKey
    },
    agent: getHttpsAgent()
  });

  const json = await response.json();
  if (json.resultType === 'SUCCESS') {
    return json.success.key;
  }
  throw new Error(json.error?.message || 'Failed to get promotion key');
};

/**
 * Execute Promotion Reward
 */
export const executePromotion = async (userKey, promotionCode, key, amount) => {
  const url = resolveTossUrl('/api-partner/v1/apps-in-toss/promotion/execute-promotion');
  const clientId = process.env.TOSS_CLIENT_ID || process.env.CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET || process.env.CLIENT_SECRET;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credentials}`,
      'x-toss-user-key': String(userKey) // 공식 문서 명시 헤더
    },
    body: JSON.stringify({ promotionCode, key }), // [FIX] Remove 'amount' from body as per new Toss spec or context?
    // Wait, typical Toss execute-promotion requires { promotionCode, key }. The amount is determined by the key or promo code setup?
    // Re-reading context: 'amount' was passed in previous code. Let's keep it but check docs.
    // Actually, looking at previous code, amount was there. Let's keep it but formatted.
    body: JSON.stringify({ promotionCode, key, amount: Number(amount) }),
    agent: getHttpsAgent()
  });

  const json = await response.json();

  if (json.resultType === 'SUCCESS') {
    return json.success;
  } else if (json.resultType === 'FAIL') {
    const errorData = json.error || {};
    const errorCode = errorData.code || 'UNKNOWN_ERROR';
    const errorMessage = errorData.message || 'Promotion execution failed';

    console.error(`[TossClient] executePromotion Failed: ${errorCode} - ${errorMessage}`, JSON.stringify(json));

    const error = new Error(errorMessage);
    error.code = errorCode;
    throw error;
  }

  throw new Error('Unknown response type from Toss API');
};

/**
 * Check Promotion Execution Result
 */
export const getPromotionResult = async (userKey, promotionCode, key) => {
  const url = resolveTossUrl('/api-partner/v1/apps-in-toss/promotion/execution-result');
  const clientId = process.env.TOSS_CLIENT_ID || process.env.CLIENT_ID;
  const clientSecret = process.env.TOSS_CLIENT_SECRET || process.env.CLIENT_SECRET;
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${credentials}`,
      'x-toss-user-key': String(userKey) // 공식 문서 명시 헤더
    },
    body: JSON.stringify({ promotionCode, key }),
    agent: getHttpsAgent()
  });

  const json = await response.json();
  if (json.resultType === 'SUCCESS') {
    return json.success; // SUCCESS, PENDING, FAILED
  }
  throw new Error(json.error?.message || 'Failed to get promotion result');
};

