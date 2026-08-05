/* Marco Iris v2.8.6 — núcleo consolidado sem reanálise dinâmica. */

/* ===== js/data/initial-data.js ===== */
window.MARCO_INITIAL_DATA={
  schemaVersion:6,
  appId:'marco-iris-tecnologia',
  installation:{generation:'v240-clean',appVersion:'2.8.4',createdAt:new Date().toISOString()},
  updatedAt:new Date().toISOString(),
  profiles:[{
    id:'marco',name:'Marco',role:'Administrador',color:'#ff642f',pin:'',
    company:{
      name:'Marco Iris Soluções em Tecnologia',document:'',phone:'(17) 99723-3645',email:'miris_junior@hotmail.com',
      instagram:'@marcoiristec',address:'Rua Pernambuco',number:'1570',neighborhood:'Centro',city:'Catanduva - SP',zip:'',
      defaultNote:'Obrigado pela confiança. Conte com a Marco Iris Soluções em Tecnologia.'
    },createdAt:new Date().toISOString()
  }],
  activeProfileId:'marco',
  dataByProfile:{marco:{
    clients:[],serviceOrders:[],orderItems:[],payments:[],products:[],services:[],supplies:[],stockMovements:[],appointments:[],attachments:[],consents:[],
    settings:{accent:'navy-orange',autosaveFolder:false,autosaveGoogle:true,cloudOnly:true,interfaceMode:'auto',dashboardPrivacy:false,generatePaymentOnComplete:false,preventNegativeStock:true,cloudFolderStructure:'separated',nextIds:{},modules:{agenda:false,terms:false},viewModesBySection:{orders:'list',agenda:'cards',clients:'list',finance:'list',documents:'list','catalog.services':'list','catalog.products':'list','catalog.supplies':'list','catalog.movements':'list'}},
    audit:[{id:'initial',date:new Date().toISOString(),action:'Base criada',detail:'Instalação limpa v2.8.4 criada. Dados, Drive e integração começam sem herdar referências antigas.'}]
  }}
};

/* ===== js/services/secure-json-vault.js ===== */
/*
 * Borion Secure JSON Vault
 * Encrypts sensitive application JSON before it reaches local storage, a file,
 * or a cloud provider. Master passwords and recovery codes are never stored.
 */
(() => {
  'use strict';

  const FORMAT = 'borion-secure-json';
  const VERSION = 1;
  const ITERATIONS = 600000;
  const MIN_PASSWORD = 12;
  const MAX_PASSWORD = 1024;
  const MAX_CIPHERTEXT = 96 * 1024 * 1024;
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const DEK_BYTES = 32;
  const TAG_BYTES = 16;
  const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const RECOVERY_LENGTH = 30;
  const BIOMETRIC_PREFIX = 'borion_secure_biometric_v1:';
  const BIOMETRIC_SCHEMA = 1;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const contexts = new Map();
  // A senha mestra permanece somente na memoria desta aba. Contextos do mesmo
  // aplicativo (base principal e integracoes) podem reutiliza-la sem abrir
  // dialogos duplicados. Nada e gravado em localStorage, sessionStorage ou Drive.
  const credentialSecrets = new Map();
  const groupLockers = new Map();
  // Contextos do mesmo grupo também participam da troca de senha. Assim, a base
  // principal e os arquivos de integração recebem o mesmo novo invólucro antes
  // de o salvamento confirmado no Drive ser concluído.
  const groupPasswordRewrappers = new Map();

  let secureDialogQueue = Promise.resolve();
  let secureDialogSequence = 0;

  function secureDialogTheme(name) {
    const themes = {
      borion: {
        backdrop: 'rgba(0, 3, 6, .76)',
        card: 'linear-gradient(160deg, rgba(17,22,27,.99), rgba(7,10,13,.99))',
        border: 'rgba(204, 161, 96, .34)',
        text: '#f4f1eb',
        muted: '#9ca3ad',
        accent: '#cca160',
        accentText: '#171005',
        input: 'rgba(255,255,255,.045)',
        inputBorder: 'rgba(204,161,96,.32)',
        shadow: '0 30px 90px rgba(0,0,0,.58)'
      },
      marco: {
        backdrop: 'rgba(1, 10, 22, .78)',
        card: 'linear-gradient(160deg, rgba(9,39,75,.99), rgba(3,23,47,.99))',
        border: 'rgba(91, 164, 241, .30)',
        text: '#edf6ff',
        muted: '#9db3cb',
        accent: '#2f8cff',
        accentText: '#ffffff',
        input: 'rgba(255,255,255,.055)',
        inputBorder: 'rgba(91,164,241,.34)',
        shadow: '0 30px 90px rgba(0,8,22,.58)'
      },
      amanda: {
        backdrop: 'rgba(63, 32, 46, .42)',
        card: 'linear-gradient(160deg, rgba(255,255,255,.995), rgba(255,247,251,.995))',
        border: 'rgba(212, 95, 146, .24)',
        text: '#2d2330',
        muted: '#7d6d76',
        accent: '#d45f92',
        accentText: '#ffffff',
        input: '#fffafd',
        inputBorder: 'rgba(212,95,146,.32)',
        shadow: '0 30px 90px rgba(73,35,53,.28)'
      }
    };
    return themes[name] || themes.borion;
  }

  async function waitForDialogBody() {
    if (document.body) return;
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }

  function ensureSecureDialogStyles() {
    if (document.getElementById('secure-json-vault-dialog-styles')) return;
    const style = document.createElement('style');
    style.id = 'secure-json-vault-dialog-styles';
    style.textContent = `
      .sjv-overlay{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;padding:18px;background:var(--sjv-backdrop);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);animation:sjvFade .16s ease-out}
      .sjv-card{width:min(100%,470px);border:1px solid var(--sjv-border);border-radius:24px;background:var(--sjv-card);color:var(--sjv-text);box-shadow:var(--sjv-shadow);overflow:hidden;transform-origin:center;animation:sjvPop .20s cubic-bezier(.22,1,.36,1);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
      .sjv-head{display:flex;gap:14px;align-items:center;padding:22px 22px 14px}
      .sjv-icon{flex:0 0 48px;width:48px;height:48px;border-radius:15px;display:grid;place-items:center;background:color-mix(in srgb,var(--sjv-accent) 15%,transparent);border:1px solid color-mix(in srgb,var(--sjv-accent) 28%,transparent);color:var(--sjv-accent)}
      .sjv-icon svg{width:25px;height:25px;display:block}
      .sjv-brand{min-width:0}.sjv-brand small{display:block;margin:0 0 3px;color:var(--sjv-accent);font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sjv-brand h2{margin:0;font-size:20px;line-height:1.15;letter-spacing:-.02em}
      .sjv-body{padding:4px 22px 22px}.sjv-message{margin:0 0 16px;color:var(--sjv-muted);font-size:13px;line-height:1.55}.sjv-label{display:block;margin:0 0 7px;font-size:11px;font-weight:800;color:var(--sjv-text)}
      .sjv-input-wrap{display:flex;align-items:center;border:1px solid var(--sjv-input-border);background:var(--sjv-input);border-radius:14px;transition:border-color .16s,box-shadow .16s}.sjv-input-wrap:focus-within{border-color:var(--sjv-accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--sjv-accent) 16%,transparent)}
      .sjv-input{min-width:0;flex:1;width:100%;border:0;outline:0;background:transparent;color:var(--sjv-text);padding:13px 14px;font:600 15px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace}.sjv-input::placeholder{color:var(--sjv-muted);opacity:.68}
      .sjv-toggle{border:0;background:transparent;color:var(--sjv-muted);padding:10px 13px;cursor:pointer;font-size:11px;font-weight:800}.sjv-toggle:hover{color:var(--sjv-text)}
      .sjv-error{margin:10px 0 0;padding:10px 11px;border-radius:11px;background:rgba(214,71,71,.12);border:1px solid rgba(214,71,71,.24);color:#ff8d8d;font-size:11px;line-height:1.4}.sjv-note{margin:11px 0 0;color:var(--sjv-muted);font-size:10.5px;line-height:1.45}
      .sjv-actions{display:flex;justify-content:flex-end;gap:9px;padding:15px 22px 20px;border-top:1px solid color-mix(in srgb,var(--sjv-border) 80%,transparent)}
      .sjv-btn{min-height:42px;border-radius:13px;padding:0 17px;border:1px solid transparent;font:800 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer;transition:transform .12s,filter .12s,background .12s}.sjv-btn:active{transform:scale(.97)}.sjv-btn-secondary{background:transparent;border-color:var(--sjv-border);color:var(--sjv-text)}.sjv-btn-secondary:hover{background:color-mix(in srgb,var(--sjv-text) 7%,transparent)}.sjv-btn-primary{background:var(--sjv-accent);color:var(--sjv-accent-text);box-shadow:0 10px 24px color-mix(in srgb,var(--sjv-accent) 24%,transparent)}.sjv-btn-primary:hover{filter:brightness(1.06)}
      @keyframes sjvFade{from{opacity:0}to{opacity:1}}@keyframes sjvPop{from{opacity:0;transform:translateY(10px) scale(.975)}to{opacity:1;transform:none}}
      @media(max-width:520px){.sjv-overlay{padding:12px;align-items:end}.sjv-card{border-radius:24px 24px 18px 18px}.sjv-head{padding:20px 18px 13px}.sjv-body{padding:3px 18px 20px}.sjv-actions{padding:14px 18px 18px}.sjv-btn{flex:1}.sjv-icon{width:44px;height:44px;flex-basis:44px}}
      @media(prefers-reduced-motion:reduce){.sjv-overlay,.sjv-card{animation:none}.sjv-btn,.sjv-input-wrap{transition:none}}
    `;
    document.head.appendChild(style);
  }

  function renderSecureDialog(config) {
    return new Promise(async resolve => {
      await waitForDialogBody();
      ensureSecureDialogStyles();
      const theme = secureDialogTheme(config.theme);
      const overlay = document.createElement('div');
      overlay.className = 'sjv-overlay';
      overlay.setAttribute('role', 'presentation');
      Object.entries(theme).forEach(([key, value]) => overlay.style.setProperty(`--sjv-${key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)}`, value));

      const card = document.createElement('section');
      card.className = 'sjv-card';
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      const titleId = `sjv-title-${++secureDialogSequence}`;
      card.setAttribute('aria-labelledby', titleId);

      const head = document.createElement('div');
      head.className = 'sjv-head';
      const icon = document.createElement('div');
      icon.className = 'sjv-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="3"></rect><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"></path><path d="M12 14v2.5"></path></svg>';
      const brand = document.createElement('div');
      brand.className = 'sjv-brand';
      const app = document.createElement('small');
      app.textContent = config.appName || 'Aplicativo';
      const title = document.createElement('h2');
      title.id = titleId;
      title.textContent = config.title || 'Acesso seguro';
      brand.append(app, title);
      head.append(icon, brand);

      const form = document.createElement('form');
      form.noValidate = true;
      const body = document.createElement('div');
      body.className = 'sjv-body';
      const message = document.createElement('p');
      message.className = 'sjv-message';
      message.textContent = config.message || '';
      body.appendChild(message);

      let input = null;
      let toggle = null;
      if (config.input !== false) {
        const label = document.createElement('label');
        label.className = 'sjv-label';
        label.textContent = config.label || 'Senha mestra';
        const wrap = document.createElement('div');
        wrap.className = 'sjv-input-wrap';
        input = document.createElement('input');
        input.className = 'sjv-input';
        input.type = config.inputType || 'password';
        input.autocomplete = config.autocomplete || 'current-password';
        input.placeholder = config.placeholder || 'Digite sua senha';
        input.setAttribute('aria-label', label.textContent);
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');
        input.required = true;
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'sjv-toggle';
        toggle.textContent = 'Mostrar';
        toggle.setAttribute('aria-label', 'Mostrar senha');
        toggle.addEventListener('click', () => {
          const visible = input.type === 'text';
          input.type = visible ? 'password' : 'text';
          toggle.textContent = visible ? 'Mostrar' : 'Ocultar';
          toggle.setAttribute('aria-label', visible ? 'Mostrar senha' : 'Ocultar senha');
          input.focus({ preventScroll: true });
        });
        wrap.append(input, toggle);
        label.appendChild(wrap);
        body.appendChild(label);
      }

      if (config.error) {
        const error = document.createElement('p');
        error.className = 'sjv-error';
        error.setAttribute('role', 'alert');
        error.textContent = config.error;
        body.appendChild(error);
      }
      if (config.note !== false) {
        const note = document.createElement('p');
        note.className = 'sjv-note';
        note.textContent = config.note || 'A senha é processada somente neste dispositivo para abrir os dados criptografados.';
        body.appendChild(note);
      }

      const actions = document.createElement('div');
      actions.className = 'sjv-actions';
      let cancel = null;
      if (config.cancelLabel) {
        cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'sjv-btn sjv-btn-secondary';
        cancel.textContent = config.cancelLabel;
        actions.appendChild(cancel);
      }
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'sjv-btn sjv-btn-primary';
      submit.textContent = config.submitLabel || 'Continuar';
      actions.appendChild(submit);
      form.append(body, actions);
      card.append(head, form);
      overlay.appendChild(card);

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.appendChild(overlay);
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', onKeydown, true);
        if (input) input.value = '';
        overlay.remove();
        document.body.style.overflow = previousOverflow;
        resolve(value);
      };
      const onKeydown = event => {
        if (event.key === 'Escape' && cancel) {
          event.preventDefault();
          finish(null);
        }
      };
      document.addEventListener('keydown', onKeydown, true);
      if (cancel) cancel.addEventListener('click', () => finish(null));
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (input && !input.value) {
          input.focus({ preventScroll: true });
          return;
        }
        finish(input ? input.value : '__accepted__');
      });
      requestAnimationFrame(() => (input || submit).focus({ preventScroll: true }));
    });
  }

  function secureDialog(config) {
    const task = secureDialogQueue.then(() => renderSecureDialog(config), () => renderSecureDialog(config));
    secureDialogQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  async function securePrompt(config) {
    const value = await secureDialog({ ...config, input: true });
    return value === null ? null : String(value);
  }

  async function secureConfirm(config) {
    return (await secureDialog({ ...config, input: false, cancelLabel: config.cancelLabel || 'Cancelar' })) !== null;
  }

  async function secureAlert(config) {
    await secureDialog({ ...config, input: false, cancelLabel: '' });
  }


  function fail(code, cause) {
    const error = new Error(code);
    error.code = code;
    if (cause) error.cause = cause;
    throw error;
  }

  function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  function bytesToBase64(bytes) {
    const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const parts = [];
    for (let offset = 0; offset < source.length; offset += 4096) {
      parts.push(String.fromCharCode(...source.subarray(offset, offset + 4096)));
    }
    return btoa(parts.join(''));
  }

  function base64ToBytes(value, { exact = null, min = 1, max = MAX_CIPHERTEXT } = {}) {
    if (typeof value !== 'string' || !value || value.length > Math.ceil(max * 4 / 3) + 8) fail('SECURE_VAULT_INVALID_BASE64');
    if (value.length % 4 !== 0) fail('SECURE_VAULT_INVALID_BASE64');
    const padding = value.endsWith('==') ? 2 : (value.endsWith('=') ? 1 : 0);
    const dataEnd = value.length - padding;
    for (let index = 0; index < dataEnd; index += 1) {
      const code = value.charCodeAt(index);
      const valid = (code >= 65 && code <= 90)
        || (code >= 97 && code <= 122)
        || (code >= 48 && code <= 57)
        || code === 43
        || code === 47;
      if (!valid) fail('SECURE_VAULT_INVALID_BASE64');
    }
    for (let index = dataEnd; index < value.length; index += 1) {
      if (value.charCodeAt(index) !== 61) fail('SECURE_VAULT_INVALID_BASE64');
    }
    const length = (value.length / 4) * 3 - padding;
    if (exact !== null && length !== exact) fail('SECURE_VAULT_INVALID_LENGTH');
    if (length < min || length > max) fail('SECURE_VAULT_INVALID_LENGTH');
    const decode = code => {
      if (code >= 65 && code <= 90) return code - 65;
      if (code >= 97 && code <= 122) return code - 71;
      if (code >= 48 && code <= 57) return code + 4;
      if (code === 43) return 62;
      if (code === 47) return 63;
      return 0;
    };
    const bytes = new Uint8Array(length);
    let output = 0;
    for (let index = 0; index < value.length; index += 4) {
      const packed = (decode(value.charCodeAt(index)) << 18)
        | (decode(value.charCodeAt(index + 1)) << 12)
        | (decode(value.charCodeAt(index + 2)) << 6)
        | decode(value.charCodeAt(index + 3));
      if (output < length) bytes[output++] = (packed >>> 16) & 255;
      if (output < length) bytes[output++] = (packed >>> 8) & 255;
      if (output < length) bytes[output++] = packed & 255;
    }
    return bytes;
  }

  function bytesToBase64Url(bytes) {
    return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlToBytes(value, options = {}) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) fail('SECURE_VAULT_INVALID_BIOMETRIC_RECORD');
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    return base64ToBytes(base64, options);
  }

  function isMobileBiometricDevice() {
    try {
      return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')
        || !!window.matchMedia?.('(pointer: coarse)')?.matches;
    } catch (_) {
      return false;
    }
  }

  async function biometricPlatformAvailable() {
    if (
      !isMobileBiometricDevice()
      || !window.PublicKeyCredential
      || !navigator.credentials?.create
      || !navigator.credentials?.get
      || typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== 'function'
    ) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (_) {
      return false;
    }
  }

  function biometricStorageKey(appId, vaultId) {
    return `${BIOMETRIC_PREFIX}${appId}:${vaultId}`;
  }

  function biometricAad(appId, vaultId, credentialId) {
    return encoder.encode(`${FORMAT}|BIOMETRIC|${BIOMETRIC_SCHEMA}|${appId}|${vaultId}|${credentialId}`);
  }

  function readBiometricRecord(appId, vaultId) {
    let record = null;
    try { record = JSON.parse(localStorage.getItem(biometricStorageKey(appId, vaultId)) || 'null'); }
    catch (_) { return null; }
    if (
      !record
      || Number(record.schema) !== BIOMETRIC_SCHEMA
      || record.appId !== appId
      || record.vaultId !== vaultId
      || typeof record.createdAt !== 'string'
    ) return null;
    try {
      const credentialId = base64UrlToBytes(record.credentialId, { min: 16, max: 1024 });
      const salt = base64UrlToBytes(record.salt, { exact: 32, max: 32 });
      const iv = base64UrlToBytes(record.iv, { exact: 12, max: 12 });
      const data = base64UrlToBytes(record.data, { min: 17, max: 4096 });
      credentialId.fill(0); salt.fill(0); iv.fill(0); data.fill(0);
      return record;
    } catch (_) {
      return null;
    }
  }

  async function biometricWrapKey(prfBytes) {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', prfBytes));
    try {
      return await crypto.subtle.importKey('raw', digest, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    } finally {
      digest.fill(0);
    }
  }

  function biometricPrfBytes(assertion) {
    const first = assertion?.getClientExtensionResults?.()?.prf?.results?.first;
    if (!first) fail('SECURE_VAULT_BIOMETRIC_UNAVAILABLE');
    const bytes = new Uint8Array(first);
    if (bytes.length < 16 || bytes.length > 128) fail('SECURE_VAULT_BIOMETRIC_UNAVAILABLE');
    return bytes;
  }

  async function enrollBiometric(appId, appName, vaultId, password, ownerId) {
    if (!(await biometricPlatformAvailable())) return false;
    const userId = randomBytes(32);
    const challenge = randomBytes(32);
    let credential;
    try {
      credential = await navigator.credentials.create({
        publicKey: {
          rp: { name: appName, id: window.location.hostname },
          user: {
            id: userId,
            name: String(ownerId || `${appId}-vault`).slice(0, 64),
            displayName: appName.slice(0, 64)
          },
          challenge,
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
          },
          attestation: 'none',
          timeout: 60000,
          extensions: { prf: {} }
        }
      });
    } finally {
      userId.fill(0);
      challenge.fill(0);
    }
    if (!credential?.getClientExtensionResults?.()?.prf?.enabled) fail('SECURE_VAULT_BIOMETRIC_UNAVAILABLE');
    const credentialIdText = bytesToBase64Url(credential.rawId);
    const credentialId = base64UrlToBytes(credentialIdText, { min: 16, max: 1024 });
    const salt = randomBytes(32);
    const assertionChallenge = randomBytes(32);
    let assertion;
    try {
      assertion = await navigator.credentials.get({
        publicKey: {
          challenge: assertionChallenge,
          rpId: window.location.hostname,
          allowCredentials: [{ id: credentialId, type: 'public-key', transports: ['internal'] }],
          userVerification: 'required',
          timeout: 60000,
          extensions: { prf: { eval: { first: salt } } }
        }
      });
    } finally {
      assertionChallenge.fill(0);
      credentialId.fill(0);
    }
    const prfBytes = biometricPrfBytes(assertion);
    const wrapKey = await biometricWrapKey(prfBytes);
    prfBytes.fill(0);
    const iv = randomBytes(12);
    const passwordBytes = encoder.encode(password);
    const associated = biometricAad(appId, vaultId, credentialIdText);
    try {
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: associated, tagLength: 128 },
        wrapKey,
        passwordBytes
      );
      localStorage.setItem(biometricStorageKey(appId, vaultId), JSON.stringify({
        schema: BIOMETRIC_SCHEMA,
        appId,
        vaultId,
        credentialId: credentialIdText,
        salt: bytesToBase64Url(salt),
        iv: bytesToBase64Url(iv),
        data: bytesToBase64Url(encrypted),
        createdAt: new Date().toISOString()
      }));
      return true;
    } finally {
      salt.fill(0);
      iv.fill(0);
      passwordBytes.fill(0);
      associated.fill(0);
    }
  }

  async function unlockWithBiometric(appId, envelope) {
    const record = readBiometricRecord(appId, envelope.vaultId);
    if (!record || !(await biometricPlatformAvailable())) return null;
    const credentialId = base64UrlToBytes(record.credentialId, { min: 16, max: 1024 });
    const salt = base64UrlToBytes(record.salt, { exact: 32, max: 32 });
    const iv = base64UrlToBytes(record.iv, { exact: 12, max: 12 });
    const data = base64UrlToBytes(record.data, { min: 17, max: 4096 });
    const challenge = randomBytes(32);
    let plainBytes;
    try {
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname,
          allowCredentials: [{ id: credentialId, type: 'public-key', transports: ['internal'] }],
          userVerification: 'required',
          timeout: 60000,
          extensions: { prf: { eval: { first: salt } } }
        }
      });
      const prfBytes = biometricPrfBytes(assertion);
      const wrapKey = await biometricWrapKey(prfBytes);
      prfBytes.fill(0);
      const associated = biometricAad(appId, envelope.vaultId, record.credentialId);
      try {
        plainBytes = new Uint8Array(await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv, additionalData: associated, tagLength: 128 },
          wrapKey,
          data
        ));
      } finally {
        associated.fill(0);
      }
      const password = decoder.decode(plainBytes);
      const dek = await unwrapDek(envelope, password, 'password');
      return dek;
    } finally {
      credentialId.fill(0);
      salt.fill(0);
      iv.fill(0);
      data.fill(0);
      challenge.fill(0);
      plainBytes?.fill(0);
    }
  }

  function randomId() {
    return crypto.randomUUID ? crypto.randomUUID() : bytesToBase64(randomBytes(24)).replace(/[^a-z0-9]/gi, '');
  }

  function canonicalRecoveryCode(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function generateRecoveryCode() {
    const limit = Math.floor(256 / RECOVERY_ALPHABET.length) * RECOVERY_ALPHABET.length;
    let raw = '';
    while (raw.length < RECOVERY_LENGTH) {
      for (const byte of randomBytes(48)) {
        if (byte >= limit) continue;
        raw += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
        if (raw.length === RECOVERY_LENGTH) break;
      }
    }
    return raw.match(/.{1,5}/g).join('-');
  }

  async function sha256Text(value) {
    const bytes = encoder.encode(String(value));
    try {
      return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
    } finally {
      bytes.fill(0);
    }
  }

  async function deriveKey(secret, salt) {
    if (typeof secret !== 'string' || secret.length < 1 || secret.length > MAX_PASSWORD) fail('SECURE_VAULT_INVALID_SECRET');
    const secretBytes = encoder.encode(secret);
    try {
      const material = await crypto.subtle.importKey('raw', secretBytes, 'PBKDF2', false, ['deriveKey']);
      return await crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    } finally {
      secretBytes.fill(0);
    }
  }

  function aad(appId, vaultId, ownerBinding, purpose, revision = 0) {
    return encoder.encode(`${FORMAT}|${VERSION}|${appId}|${vaultId}|${ownerBinding}|${purpose}|${revision}`);
  }

  async function encryptBytes(key, bytes, associatedData) {
    const iv = randomBytes(IV_BYTES);
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: associatedData, tagLength: 128 },
      key,
      bytes
    );
    return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
  }

  async function decryptBytes(key, part, associatedData, max = MAX_CIPHERTEXT) {
    if (!part || typeof part !== 'object') fail('SECURE_VAULT_INVALID_ENVELOPE');
    const iv = base64ToBytes(part.iv, { exact: IV_BYTES, max: IV_BYTES });
    const data = base64ToBytes(part.data, { min: TAG_BYTES, max });
    try {
      return new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv, additionalData: associatedData, tagLength: 128 },
        key,
        data
      ));
    } catch (error) {
      fail('SECURE_VAULT_AUTHENTICATION_FAILED', error);
    } finally {
      iv.fill(0);
      data.fill(0);
    }
  }

  async function wrapDek(dek, secret, appId, vaultId, ownerBinding, purpose) {
    const salt = randomBytes(SALT_BYTES);
    const key = await deriveKey(secret, salt);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dek));
    try {
      return {
        kdf: {
          name: 'PBKDF2',
          hash: 'SHA-256',
          iterations: ITERATIONS,
          salt: bytesToBase64(salt)
        },
        wrappedKey: await encryptBytes(key, raw, aad(appId, vaultId, ownerBinding, purpose))
      };
    } finally {
      raw.fill(0);
      salt.fill(0);
    }
  }

  async function unwrapDek(envelope, secret, purpose) {
    const wrap = purpose === 'recovery' ? envelope.recovery : envelope.password;
    const salt = base64ToBytes(wrap?.kdf?.salt, { exact: SALT_BYTES, max: SALT_BYTES });
    if (wrap?.kdf?.name !== 'PBKDF2' || wrap?.kdf?.hash !== 'SHA-256' || Number(wrap?.kdf?.iterations) !== ITERATIONS) {
      salt.fill(0);
      fail('SECURE_VAULT_INVALID_KDF');
    }
    const key = await deriveKey(secret, salt);
    salt.fill(0);
    const raw = await decryptBytes(
      key,
      wrap.wrappedKey,
      aad(envelope.appId, envelope.vaultId, envelope.ownerBinding, purpose),
      DEK_BYTES + TAG_BYTES
    );
    if (raw.length !== DEK_BYTES) {
      raw.fill(0);
      fail('SECURE_VAULT_INVALID_KEY');
    }
    try {
      return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    } finally {
      raw.fill(0);
    }
  }

  function assertEnvelope(envelope, expectedAppId = '') {
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) fail('SECURE_VAULT_INVALID_ENVELOPE');
    if (envelope.format !== FORMAT || Number(envelope.formatVersion) !== VERSION) fail('SECURE_VAULT_UNSUPPORTED_FORMAT');
    if (expectedAppId && envelope.appId !== expectedAppId) fail('SECURE_VAULT_WRONG_APP');
    if (typeof envelope.appId !== 'string' || !envelope.appId || envelope.appId.length > 120) fail('SECURE_VAULT_INVALID_APP');
    if (typeof envelope.vaultId !== 'string' || !envelope.vaultId || envelope.vaultId.length > 160) fail('SECURE_VAULT_INVALID_ID');
    base64ToBytes(envelope.ownerBinding, { exact: 32, max: 32 }).fill(0);
    for (const wrap of [envelope.password, envelope.recovery]) {
      if (!wrap || wrap.kdf?.name !== 'PBKDF2' || wrap.kdf?.hash !== 'SHA-256' || Number(wrap.kdf?.iterations) !== ITERATIONS) fail('SECURE_VAULT_INVALID_KDF');
      base64ToBytes(wrap.kdf.salt, { exact: SALT_BYTES, max: SALT_BYTES }).fill(0);
      base64ToBytes(wrap.wrappedKey?.iv, { exact: IV_BYTES, max: IV_BYTES }).fill(0);
      base64ToBytes(wrap.wrappedKey?.data, { exact: DEK_BYTES + TAG_BYTES, max: DEK_BYTES + TAG_BYTES }).fill(0);
    }
    if (envelope.cipher?.name !== 'AES-GCM' || Number(envelope.cipher?.length) !== 256 || Number(envelope.cipher?.tagLength) !== 128) fail('SECURE_VAULT_INVALID_CIPHER');
    if (!Number.isSafeInteger(Number(envelope.revision)) || Number(envelope.revision) < 1) fail('SECURE_VAULT_INVALID_REVISION');
    base64ToBytes(envelope.payload?.iv, { exact: IV_BYTES, max: IV_BYTES }).fill(0);
    base64ToBytes(envelope.payload?.data, { min: TAG_BYTES, max: MAX_CIPHERTEXT }).fill(0);
    base64ToBytes(envelope.integrity?.iv, { exact: IV_BYTES, max: IV_BYTES }).fill(0);
    base64ToBytes(envelope.integrity?.data, { min: TAG_BYTES, max: 8192 }).fill(0);
    return true;
  }

  function looksLikeEnvelope(value) {
    return !!(value && typeof value === 'object' && value.format === FORMAT);
  }

  async function promptNewPassword(appId, appName, dialogTheme) {
    let error = '';
    for (;;) {
      const password = await securePrompt({
        appId,
        appName,
        theme: dialogTheme,
        title: 'Criar senha mestra',
        message: `Crie uma senha exclusiva com pelo menos ${MIN_PASSWORD} caracteres. Ela protege os dados antes de sairem deste dispositivo.`,
        label: 'Nova senha mestra',
        placeholder: 'Digite a nova senha',
        autocomplete: 'new-password',
        submitLabel: 'Continuar',
        cancelLabel: 'Cancelar',
        error
      });
      if (password === null) fail('SECURE_VAULT_SETUP_CANCELLED');
      if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
        error = `A senha precisa ter entre ${MIN_PASSWORD} e ${MAX_PASSWORD} caracteres.`;
        continue;
      }
      const confirmation = await securePrompt({
        appId,
        appName,
        theme: dialogTheme,
        title: 'Confirmar senha mestra',
        message: 'Digite novamente a mesma senha para concluir a proteção dos dados.',
        label: 'Confirme a senha mestra',
        placeholder: 'Digite novamente',
        autocomplete: 'new-password',
        submitLabel: 'Ativar criptografia',
        cancelLabel: 'Cancelar'
      });
      if (confirmation === null) fail('SECURE_VAULT_SETUP_CANCELLED');
      if (password !== confirmation) {
        error = 'As senhas não conferem. Digite novamente.';
        continue;
      }
      return password;
    }
  }

  async function downloadRecovery(appName, appId, recoveryCode, dialogTheme, options = {}) {
    const text = [
      `${appName} - chave de recuperacao`,
      '',
      recoveryCode,
      '',
      'Guarde este arquivo fora do computador e do Google Drive usados pelo aplicativo.',
      'Quem possuir esta chave podera recuperar os dados criptografados.',
      `Criado em: ${new Date().toISOString()}`
    ].join('\n');
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${appId}_CHAVE_DE_RECUPERACAO_${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (_) {}
    await secureAlert({ appName, theme: dialogTheme, title: options.title || 'Chave de recuperação salva', message: options.message || `Uma chave de recuperação foi baixada.\n\n${recoveryCode}\n\nGuarde-a fora deste computador e fora do Drive do aplicativo.`, submitLabel: 'Entendi', note: false });
  }

  function createContext(options) {
    const appId = String(options?.appId || '').trim();
    const appName = String(options?.appName || appId || 'Aplicativo').trim();
    const isSensitive = typeof options?.isSensitive === 'function' ? options.isSensitive : (() => true);
    const dialogTheme = String(options?.dialogTheme || 'borion').trim().toLowerCase();
    const credentialGroup = String(options?.credentialGroup || appId).trim() || appId;
    const googleOnlyAccess = options?.googleOnlyAccess === true;
    const autoDownloadRecovery = options?.autoDownloadRecovery !== false && !googleOnlyAccess;
    if (!appId) fail('SECURE_VAULT_INVALID_APP');
    if (contexts.has(appId)) return contexts.get(appId);

    let ownerId = '';
    let ownerBinding = '';
    let key = null;
    let template = null;
    let plaintextMigrationPending = false;
    let googleCredentialMigrationPending = false;
    let queue = Promise.resolve();
    let unlockPromise = null;
    let unlockVaultId = '';
    let lockGeneration = 0;
    let pendingRecovery = null;
    const recoveryDeliveryKey = vaultId => `secure-json-vault-recovery-delivered:${appId}:${vaultId}`;

    function rememberCredential(secret) {
      if (typeof secret === 'string' && secret) credentialSecrets.set(credentialGroup, secret);
    }
    function forgetCredential() { credentialSecrets.delete(credentialGroup); }
    function clearSessionOnly() {
      lockGeneration += 1;
      key = null;
      template = null;
      plaintextMigrationPending = false;
      googleCredentialMigrationPending = false;
      unlockPromise = null;
      unlockVaultId = '';
      pendingRecovery = null;
    }
    if (!groupLockers.has(credentialGroup)) groupLockers.set(credentialGroup, new Set());
    groupLockers.get(credentialGroup).add(clearSessionOnly);

    async function rewrapPasswordForGroup(currentPassword, newPassword) {
      if (!key || !template) return { appId, changed: false, rollback() {} };
      const previousTemplate = template;
      const verifiedKey = await unwrapDek(template, currentPassword, 'password');
      await decryptEnvelope(template, verifiedKey);
      const wrapped = await wrapDek(key, newPassword, appId, template.vaultId, template.ownerBinding, 'password');
      template = { ...template, password: wrapped, passwordChangedAt: new Date().toISOString() };
      return {
        appId,
        changed: true,
        rollback() { template = previousTemplate; }
      };
    }
    if (!groupPasswordRewrappers.has(credentialGroup)) groupPasswordRewrappers.set(credentialGroup, new Set());
    groupPasswordRewrappers.get(credentialGroup).add(rewrapPasswordForGroup);

    async function bindOwner(value) {
      ownerId = String(value || '').trim();
      if (!ownerId) fail('SECURE_VAULT_OWNER_REQUIRED');
      ownerBinding = await sha256Text(`${FORMAT}|${appId}|OWNER|${ownerId}`);
      if (template && template.ownerBinding !== ownerBinding) {
        key = null;
        template = null;
        plaintextMigrationPending = false;
        googleCredentialMigrationPending = false;
        fail('SECURE_VAULT_WRONG_OWNER');
      }
      return ownerBinding;
    }

    async function googleAccountSecret() {
      if (!googleOnlyAccess) fail('SECURE_VAULT_GOOGLE_ONLY_DISABLED');
      if (!ownerId || !ownerBinding) fail('SECURE_VAULT_OWNER_REQUIRED');
      // Chave automática e determinística por aplicativo + identidade Google.
      // Ela elimina a senha adicional sem gravar segredos no navegador ou no Drive.
      return await sha256Text(`${FORMAT}|${VERSION}|${appId}|GOOGLE_ACCOUNT_ONLY|${ownerId}|v1`);
    }

    async function createEnvelope(value) {
      if (!ownerBinding) fail('SECURE_VAULT_OWNER_REQUIRED');
      const password = googleOnlyAccess
        ? await googleAccountSecret()
        : (credentialSecrets.get(credentialGroup) || await promptNewPassword(appId, appName, dialogTheme));
      if (!googleOnlyAccess) rememberCredential(password);
      const recoveryCode = generateRecoveryCode();
      const recoverySecret = canonicalRecoveryCode(recoveryCode);
      const vaultId = randomId();
      const dek = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      const passwordWrap = await wrapDek(dek, password, appId, vaultId, ownerBinding, 'password');
      const recoveryWrap = await wrapDek(dek, recoverySecret, appId, vaultId, ownerBinding, 'recovery');
      key = dek;
      template = {
        format: FORMAT,
        formatVersion: VERSION,
        appId,
        vaultId,
        ownerBinding,
        password: passwordWrap,
        authMode: googleOnlyAccess ? 'google-account-v1' : 'master-password-v1',
        recovery: { ...recoveryWrap, createdAt: new Date().toISOString() },
        cipher: { name: 'AES-GCM', length: 256, tagLength: 128 },
        revision: 0,
        createdAt: new Date().toISOString()
      };
      const envelope = await updateEnvelope(value);
      // Entrega a chave de recuperação somente depois que o primeiro
      // envelope tiver sido realmente persistido pelo aplicativo.
      pendingRecovery = autoDownloadRecovery ? { vaultId, recoveryCode } : null;
      if (
        !googleOnlyAccess
        && !readBiometricRecord(appId, vaultId)
        && await biometricPlatformAvailable()
        && await secureConfirm({ appName, theme: dialogTheme, title: 'Ativar biometria', message: 'Deseja usar a biometria deste celular nos próximos acessos?', submitLabel: 'Ativar biometria', cancelLabel: 'Agora não', note: false })
      ) {
        try {
          await enrollBiometric(appId, appName, vaultId, password, ownerId);
          await secureAlert({ appName, theme: dialogTheme, title: 'Biometria ativada', message: 'Este dispositivo poderá usar a biometria nos próximos acessos.', submitLabel: 'Concluir', note: false });
        } catch (error) {
          console.warn('[SecureJsonVault] A biometria nao foi ativada; a senha mestra continua disponivel:', error);
          await secureAlert({ appName, theme: dialogTheme, title: 'Biometria indisponível', message: 'O navegador não concluiu a ativação. A senha mestra continuará funcionando normalmente.', submitLabel: 'Entendi', note: false });
        }
      }
      return envelope;
    }

    async function confirmSetupPersisted(expectedVaultId = '') {
      const pending = pendingRecovery;
      if (!pending) return false;
      const expected = String(expectedVaultId || '').trim();
      if (expected && pending.vaultId !== expected) return false;
      if (!template || template.vaultId !== pending.vaultId) return false;
      pendingRecovery = null;
      let alreadyDelivered = false;
      try { alreadyDelivered = localStorage.getItem(recoveryDeliveryKey(pending.vaultId)) === '1'; } catch (_) {}
      if (alreadyDelivered) return false;
      await downloadRecovery(appName, appId, pending.recoveryCode, dialogTheme);
      try { localStorage.setItem(recoveryDeliveryKey(pending.vaultId), '1'); } catch (_) {}
      return true;
    }

    async function updateEnvelope(value) {
      if (!key || !template) fail('SECURE_VAULT_LOCKED');
      const revision = Number(template.revision || 0) + 1;
      const updatedAt = new Date().toISOString();
      const plain = encoder.encode(JSON.stringify(value));
      let payload;
      try {
        payload = await encryptBytes(key, plain, aad(appId, template.vaultId, template.ownerBinding, 'payload', revision));
      } finally {
        plain.fill(0);
      }
      const header = {
        marker: 'BORION_SECURE_JSON_OK',
        appId,
        vaultId: template.vaultId,
        ownerBinding: template.ownerBinding,
        revision,
        updatedAt
      };
      const headerBytes = encoder.encode(JSON.stringify(header));
      let integrity;
      try {
        integrity = await encryptBytes(key, headerBytes, aad(appId, template.vaultId, template.ownerBinding, 'integrity', revision));
      } finally {
        headerBytes.fill(0);
      }
      const envelope = { ...template, revision, updatedAt, payload, integrity };
      assertEnvelope(envelope, appId);
      template = envelope;
      return envelope;
    }

    async function decryptEnvelope(envelope, dek) {
      assertEnvelope(envelope, appId);
      if (ownerBinding && envelope.ownerBinding !== ownerBinding) fail('SECURE_VAULT_WRONG_OWNER');
      const revision = Number(envelope.revision);
      const integrityBytes = await decryptBytes(
        dek,
        envelope.integrity,
        aad(appId, envelope.vaultId, envelope.ownerBinding, 'integrity', revision),
        8192
      );
      let integrity;
      try { integrity = JSON.parse(decoder.decode(integrityBytes)); }
      finally { integrityBytes.fill(0); }
      if (
        integrity?.marker !== 'BORION_SECURE_JSON_OK' ||
        integrity.appId !== appId ||
        integrity.vaultId !== envelope.vaultId ||
        integrity.ownerBinding !== envelope.ownerBinding ||
        Number(integrity.revision) !== revision ||
        integrity.updatedAt !== envelope.updatedAt
      ) fail('SECURE_VAULT_INTEGRITY_FAILED');
      const plain = await decryptBytes(
        dek,
        envelope.payload,
        aad(appId, envelope.vaultId, envelope.ownerBinding, 'payload', revision)
      );
      try { return JSON.parse(decoder.decode(plain)); }
      catch (error) { fail('SECURE_VAULT_INVALID_PAYLOAD', error); }
      finally { plain.fill(0); }
    }

    async function requestUnlock(envelope) {
      if (!ownerBinding) fail('SECURE_VAULT_OWNER_REQUIRED');
      if (envelope.ownerBinding !== ownerBinding) fail('SECURE_VAULT_WRONG_OWNER');
      if (googleOnlyAccess) {
        try {
          const googleDek = await unwrapDek(envelope, await googleAccountSecret(), 'password');
          await decryptEnvelope(envelope, googleDek);
          return googleDek;
        } catch (error) {
          if (error?.code && !['SECURE_VAULT_AUTHENTICATION_FAILED', 'SECURE_VAULT_INVALID_SECRET'].includes(error.code)) throw error;
          // Envelope antigo: segue para a confirmação única e migração automática.
        }
      }
      const sharedPassword = credentialSecrets.get(credentialGroup);
      if (sharedPassword) {
        try {
          const sharedDek = await unwrapDek(envelope, sharedPassword, 'password');
          await decryptEnvelope(envelope, sharedDek);
          return sharedDek;
        } catch (error) {
          if (error?.code && !['SECURE_VAULT_AUTHENTICATION_FAILED', 'SECURE_VAULT_INVALID_SECRET'].includes(error.code)) throw error;
          forgetCredential();
        }
      }
      if (!googleOnlyAccess && readBiometricRecord(appId, envelope.vaultId)) {
        try {
          const biometricDek = await unlockWithBiometric(appId, envelope);
          if (biometricDek) return biometricDek;
        } catch (error) {
          console.warn('[SecureJsonVault] Biometria cancelada ou indisponivel; solicitando a senha mestra:', error);
        }
      }
      let unlockError = '';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const password = await securePrompt({
          appId,
          appName,
          theme: dialogTheme,
          title: googleOnlyAccess ? 'Conversão para acesso pelo Google' : 'Desbloquear dados',
          message: googleOnlyAccess
            ? 'Esta base foi protegida por uma senha em uma versão anterior. Digite-a uma última vez para vincular os dados à conta Google e remover essa etapa dos próximos acessos.'
            : 'Digite sua senha de proteção para abrir a base criptografada.',
          label: googleOnlyAccess ? 'Senha antiga de proteção' : 'Senha de proteção',
          placeholder: googleOnlyAccess ? 'Digite a senha usada anteriormente' : 'Digite sua senha',
          autocomplete: 'current-password',
          submitLabel: 'Desbloquear',
          cancelLabel: 'Cancelar',
          error: unlockError
        });
        if (password === null) fail('SECURE_VAULT_UNLOCK_CANCELLED');
        try {
          const dek = await unwrapDek(envelope, password, 'password');
          rememberCredential(password);
          if (
            !googleOnlyAccess
            && !readBiometricRecord(appId, envelope.vaultId)
            && await biometricPlatformAvailable()
            && await secureConfirm({ appName, theme: dialogTheme, title: 'Ativar biometria', message: 'Deseja usar a biometria deste celular nos próximos acessos?', submitLabel: 'Ativar biometria', cancelLabel: 'Agora não', note: false })
          ) {
            try {
              await enrollBiometric(appId, appName, envelope.vaultId, password, ownerId);
              await secureAlert({ appName, theme: dialogTheme, title: 'Biometria ativada', message: 'Este dispositivo poderá usar a biometria nos próximos acessos.', submitLabel: 'Concluir', note: false });
            } catch (biometricError) {
              console.warn('[SecureJsonVault] A biometria nao foi ativada; a senha mestra continua disponivel:', biometricError);
            }
          }
          return dek;
        } catch (error) {
          if (error?.code && !['SECURE_VAULT_AUTHENTICATION_FAILED', 'SECURE_VAULT_INVALID_SECRET'].includes(error.code)) throw error;
          unlockError = `Senha incorreta. Restam ${2 - attempt} tentativa(s).`;
        }
      }
      const useRecovery = await secureConfirm({ appName, theme: dialogTheme, title: 'Usar chave de recuperação', message: 'As tentativas de senha terminaram. Deseja abrir a base com a chave de recuperação?', submitLabel: 'Usar chave', cancelLabel: 'Cancelar', note: false });
      if (!useRecovery) fail('SECURE_VAULT_LOCKED');
      const recovery = await securePrompt({ appId, appName, theme: dialogTheme, title: 'Chave de recuperação', message: 'Digite a chave de recuperação deste aplicativo.', label: 'Chave de recuperação', placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX', autocomplete: 'off', submitLabel: 'Recuperar acesso', cancelLabel: 'Cancelar' });
      if (recovery === null) fail('SECURE_VAULT_UNLOCK_CANCELLED');
      const canonical = canonicalRecoveryCode(recovery);
      if (canonical.length !== RECOVERY_LENGTH) fail('SECURE_VAULT_INVALID_RECOVERY');
      const dek = await unwrapDek(envelope, canonical, 'recovery');
      await decryptEnvelope(envelope, dek);
      return dek;
    }

    async function ensureSessionUnlocked(envelope) {
      if (key && template && template.vaultId === envelope.vaultId) return key;
      if (unlockPromise) {
        if (unlockVaultId === envelope.vaultId) return await unlockPromise;
        try { await unlockPromise; } catch (_) {}
        if (key && template && template.vaultId === envelope.vaultId) return key;
      }
      unlockVaultId = envelope.vaultId;
      const generation = lockGeneration;
      const activePromise = (async () => {
        const unlocked = await requestUnlock(envelope);
        await decryptEnvelope(envelope, unlocked);
        if (generation !== lockGeneration) fail('SECURE_VAULT_LOCKED');
        key = unlocked;
        template = envelope;
        if (googleOnlyAccess && envelope.authMode !== 'google-account-v1') {
          const automaticWrap = await wrapDek(unlocked, await googleAccountSecret(), appId, envelope.vaultId, envelope.ownerBinding, 'password');
          template = {
            ...envelope,
            password: automaticWrap,
            authMode: 'google-account-v1',
            googleCredentialMigratedAt: new Date().toISOString()
          };
          googleCredentialMigrationPending = true;
        }
        return unlocked;
      })();
      unlockPromise = activePromise;
      try {
        return await activePromise;
      } finally {
        if (unlockPromise === activePromise) {
          unlockPromise = null;
          unlockVaultId = '';
        }
      }
    }

    async function open(value, options = {}) {
      if (!looksLikeEnvelope(value)) {
        if (isSensitive(value)) {
          plaintextMigrationPending = true;
          if (options.prepare !== false && options.interactive !== false && (!key || !template)) {
            await createEnvelope(value);
          }
        }
        return value;
      }
      assertEnvelope(value, appId);
      if (!ownerBinding) fail('SECURE_VAULT_OWNER_REQUIRED');
      if (value.ownerBinding !== ownerBinding) fail('SECURE_VAULT_WRONG_OWNER');
      if (!key || !template || template.vaultId !== value.vaultId) {
        if (options.interactive === false) fail('SECURE_VAULT_LOCKED');
        key = await ensureSessionUnlocked(value);
      }
      const plain = await decryptEnvelope(value, key);
      if (!template || template.vaultId !== value.vaultId || (!googleCredentialMigrationPending && Number(value.revision) > Number(template.revision || 0))) {
        template = value;
      }
      return plain;
    }

    async function protect(value, options = {}) {
      if (!isSensitive(value)) return value;
      const operation = async () => {
        if (!ownerBinding) fail('SECURE_VAULT_OWNER_REQUIRED');
        if (!key || !template) {
          if (options.interactive === false) fail('SECURE_VAULT_LOCKED');
          return await createEnvelope(value);
        }
        return await updateEnvelope(value);
      };
      const result = queue.then(operation, operation);
      queue = result.catch(() => {});
      return await result;
    }

    async function openText(text, options = {}) {
      let value;
      try { value = JSON.parse(String(text)); }
      catch (error) { fail('SECURE_VAULT_INVALID_JSON', error); }
      return await open(value, options);
    }

    async function protectText(text, options = {}) {
      let value;
      try { value = JSON.parse(String(text)); }
      catch (_) { return String(text); }
      const protectedValue = await protect(value, options);
      return JSON.stringify(protectedValue);
    }

    async function changePassword(value, persistCallback) {
      if (googleOnlyAccess) return false;
      if (!key || !template) fail('SECURE_VAULT_LOCKED');
      const currentPassword = await securePrompt({
        appId, appName, theme: dialogTheme,
        title: 'Confirmar senha atual',
        message: 'Digite a senha mestra atual antes de definir uma nova senha.',
        label: 'Senha mestra atual', placeholder: 'Digite a senha atual',
        autocomplete: 'current-password', submitLabel: 'Continuar', cancelLabel: 'Cancelar'
      });
      if (currentPassword === null) return false;
      const verifiedKey = await unwrapDek(template, currentPassword, 'password');
      await decryptEnvelope(template, verifiedKey);
      const newPassword = await promptNewPassword(appId, appName, dialogTheme);
      if (newPassword === currentPassword) {
        await secureAlert({ appName, theme: dialogTheme, title: 'Senha não alterada', message: 'A nova senha deve ser diferente da senha atual.', submitLabel: 'Entendi', note: false });
        return false;
      }
      const previousCredential = credentialSecrets.get(credentialGroup) || '';
      const rotations = [];
      try {
        const rewrappers = groupPasswordRewrappers.get(credentialGroup) || new Set([rewrapPasswordForGroup]);
        for (const rewrap of rewrappers) rotations.push(await rewrap(currentPassword, newPassword));
        rememberCredential(newPassword);
        if (typeof persistCallback === 'function') await persistCallback(value);
        await secureAlert({ appName, theme: dialogTheme, title: 'Senha mestra alterada', message: 'A nova senha foi aplicada à base e às integrações abertas, e o salvamento criptografado foi confirmado.', submitLabel: 'Concluir', note: false });
        return true;
      } catch (error) {
        rotations.reverse().forEach(rotation => { try { rotation?.rollback?.(); } catch (_) {} });
        if (previousCredential) rememberCredential(previousCredential); else forgetCredential();
        throw error;
      }
    }

    async function rotateRecovery(value, persistCallback) {
      if (googleOnlyAccess) return false;
      if (!key || !template) fail('SECURE_VAULT_LOCKED');
      const confirmed = await secureConfirm({
        appName, theme: dialogTheme,
        title: 'Gerar nova chave de recuperação',
        message: 'A chave anterior deixará de abrir esta base. Gere a nova chave somente quando puder guardá-la em local seguro.',
        submitLabel: 'Gerar nova chave', cancelLabel: 'Cancelar', note: false
      });
      if (!confirmed) return false;
      const recoveryCode = generateRecoveryCode();
      const previousTemplate = template;
      try {
        const wrapped = await wrapDek(key, canonicalRecoveryCode(recoveryCode), appId, template.vaultId, template.ownerBinding, 'recovery');
        template = { ...template, recovery: { ...wrapped, createdAt: new Date().toISOString() } };
        if (typeof persistCallback === 'function') await persistCallback(value);
        await downloadRecovery(appName, appId, recoveryCode, dialogTheme, {
          title: 'Nova chave de recuperação salva',
          message: `A nova chave foi baixada. A chave anterior não deve mais ser usada.\n\n${recoveryCode}\n\nGuarde este arquivo fora do computador e do Drive do aplicativo.`
        });
        try { localStorage.setItem(recoveryDeliveryKey(template.vaultId), '1'); } catch (_) {}
        return true;
      } catch (error) {
        template = previousTemplate;
        throw error;
      }
    }

    function lock() {
      forgetCredential();
      const lockers = groupLockers.get(credentialGroup);
      if (lockers) lockers.forEach(clear => { try { clear(); } catch (_) {} });
      else clearSessionOnly();
    }

    const context = Object.freeze({
      appId,
      appName,
      bindOwner,
      open,
      protect,
      openText,
      protectText,
      isEnvelope: looksLikeEnvelope,
      isSensitive,
      needsMigration: () => plaintextMigrationPending || googleCredentialMigrationPending,
      markMigrated: () => { plaintextMigrationPending = false; googleCredentialMigrationPending = false; },
      confirmSetupPersisted,
      changePassword,
      rotateRecovery,
      lock,
      status: () => ({ appId, ownerBound: !!ownerBinding, unlocked: !!key, googleOnlyAccess, authMode: template?.authMode || '', migrationPending: plaintextMigrationPending || googleCredentialMigrationPending, vaultId: template?.vaultId || '', revision: Number(template?.revision || 0) })
    });
    contexts.set(appId, context);
    return context;
  }

  window.SecureJsonVault = Object.freeze({
    FORMAT,
    VERSION,
    ITERATIONS,
    MIN_PASSWORD,
    isEnvelope: looksLikeEnvelope,
    forApp: createContext
  });
})();

/* ===== js/services/storage.js ===== */
(() => {
  'use strict';

  /*
   * Marco Iris Cloud-Only Storage (v2.6.6)
   * ---------------------------------------
   * Nenhum dado de negócio é persistido no navegador. Clientes, OSVs,
   * lançamentos, exclusões, rascunhos e mídias existem apenas em memória até
   * serem confirmados no Google Drive. localStorage continua reservado apenas
   * para credenciais técnicas do Google e IDs da pasta escolhida.
   */
  const DATA_FILE='Marco_Iris_Dados.json';
  const Vault=window.SecureJsonVault.forApp({
    appId:'marco-iris-tecnologia',
    appName:'Marco Iris Tecnologia',
    dialogTheme:'marco',
    credentialGroup:'marco-iris-suite',
    googleOnlyAccess:true,
    isSensitive:value=>!!(value&&typeof value==='object'&&value.appId==='marco-iris-tecnologia'&&value.dataByProfile)
  });
  const LEGACY_DATABASES=[
    'marco_iris_tecnologia_db_v240_clean',
    'marco_iris_tecnologia_db',
    'marco_iris_tecnologia'
  ];
  let syncBaseMemory=null;
  const mediaMemory=new Map();
  const draftMemory=new Map();

  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

  async function load(){
    return clone(window.MARCO_INITIAL_DATA);
  }

  async function save(state,{touch=true}={}){
    if(touch&&state)state.updatedAt=new Date().toISOString();
    return state;
  }

  async function loadSyncBase(){return syncBaseMemory?clone(syncBaseMemory):null;}
  async function saveSyncBase(state){syncBaseMemory=state?clone(state):null;return state;}
  async function clearSyncBase(){syncBaseMemory=null;return true;}

  async function createBackup(state,reason='manual'){
    if(!navigator.onLine)throw new Error('Internet obrigatória para criar backup no Google Drive.');
    if(!window.GoogleDriveMarco?.isConfigured?.())throw new Error('Conecte o Google Drive antes de criar backup.');
    await window.GoogleDriveMarco.writeForceSave(state);
    return {id:`drive_${Date.now()}`,createdAt:new Date().toISOString(),reason,cloud:true};
  }
  async function listBackups(){return [];}
  async function restoreBackup(){return null;}

  async function putMedia(blob,meta={}){
    if(!(blob instanceof Blob))throw new Error('O arquivo selecionado não pôde ser processado.');
    if(blob.size<=0)throw new Error(`O arquivo ${meta.name||'selecionado'} está vazio ou não pôde ser lido.`);
    if(!navigator.onLine)throw new Error('Internet obrigatória para adicionar arquivos.');
    const id=meta.id||`memory_media_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const record={id,blob,name:meta.name||'arquivo',type:meta.type||blob.type||'application/octet-stream',size:blob.size,createdAt:meta.createdAt||new Date().toISOString()};
    mediaMemory.set(id,record);
    return record;
  }
  async function getMedia(id){return id?mediaMemory.get(id)||null:null;}
  async function deleteMedia(id){if(id)mediaMemory.delete(id);}

  async function saveDraft(key,draft){
    if(!key)throw new Error('Chave de rascunho inválida.');
    const record={...clone(draft||{}),key,updatedAt:draft?.updatedAt||new Date().toISOString()};
    draftMemory.set(key,record);
    return clone(record);
  }
  async function getDraft(key){const record=key?draftMemory.get(key):null;return record?clone(record):null;}
  async function deleteDraft(key){if(key)draftMemory.delete(key);}
  async function listDrafts(){return [...draftMemory.values()].map(clone).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));}
  async function putDraftMedia(blob,meta={}){return await putMedia(blob,{...meta,id:meta.id||`memory_draft_media_${Date.now()}_${Math.random().toString(36).slice(2,8)}`});}
  async function deleteDraftMedia(id){return await deleteMedia(id);}

  async function connectFolder(){throw new Error('O modo nuvem obrigatória não usa pasta local.');}
  async function getFolderHandle(){return null;}
  async function forgetFolder(){return true;}
  async function ensurePermission(){return false;}
  async function saveToFolder(){throw new Error('O modo nuvem obrigatória não salva dados em pasta local.');}
  async function readFromFolder(){throw new Error('O modo nuvem obrigatória carrega dados somente do Google Drive.');}

  function stamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;}
  async function downloadJson(state,filename=`Marco_Iris_Backup_${stamp()}.json`){const protectedState=await Vault.protect(state);downloadBlob(new Blob([JSON.stringify(protectedState,null,2)],{type:'application/json'}),filename);await Vault.confirmSetupPersisted?.(Vault.status?.().vaultId||'');}
  function downloadBlob(blob,filename){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  async function readUploadedJson(file){const obj=await Vault.open(JSON.parse(await file.text()));if(obj?.appId!=='marco-iris-tecnologia'||!obj.dataByProfile)throw new Error('Arquivo incompatível com o sistema Marco Iris.');return obj;}

  async function deleteLegacyDatabase(name){
    if(!globalThis.indexedDB)return false;
    return await new Promise(resolve=>{
      const request=indexedDB.deleteDatabase(name);
      request.onsuccess=()=>resolve(true);
      request.onerror=()=>resolve(false);
      request.onblocked=()=>resolve(false);
    });
  }

  async function purgeLegacyData(){
    mediaMemory.clear();draftMemory.clear();syncBaseMemory=null;
    await Promise.all(LEGACY_DATABASES.map(deleteLegacyDatabase));
    for(let i=localStorage.length-1;i>=0;i--){
      const key=localStorage.key(i)||'';
      /* Preserve somente autenticação, configuração e IDs técnicos do Drive. */
      if((key.startsWith('marco_iris_')||key.startsWith('marco-iris-'))&&!key.startsWith('marco_iris_v240_gdrive_')&&!key.startsWith('marco_iris_device_id_'))localStorage.removeItem(key);
    }
    for(let i=sessionStorage.length-1;i>=0;i--){
      const key=sessionStorage.key(i)||'';
      if(key.startsWith('marco_iris_')||key.startsWith('marco-iris-'))sessionStorage.removeItem(key);
    }
    return true;
  }

  async function wipeAll(){return await purgeLegacyData();}

  window.MarcoStorage={
    load,save,loadSyncBase,saveSyncBase,clearSyncBase,
    createBackup,listBackups,restoreBackup,
    putMedia,getMedia,deleteMedia,
    saveDraft,getDraft,deleteDraft,listDrafts,putDraftMedia,deleteDraftMedia,
    connectFolder,getFolderHandle,forgetFolder,ensurePermission,saveToFolder,readFromFolder,
    downloadJson,downloadBlob,readUploadedJson,wipeAll,purgeLegacyData,
    DATA_FILE,DB_NAME:'cloud-only-no-indexeddb',cloudOnly:true
  };
})();

/* ===== js/services/identifiers.js ===== */
(() => {
  'use strict';

  const OFFICIAL_PREFIXES = Object.freeze(['OSV','CLI','PRD','SRV','INS','ITM','MOV','REC','DES','AGE','TER']);
  const PREFIX_ALIASES = Object.freeze({
    OS:'OSV', OAS:'OSV', OSV:'OSV',
    CLI:'CLI',
    PRB:'PRD', PRD:'PRD',
    SRV:'SRV',
    INS:'INS',
    ITM:'ITM',
    MOV:'MOV',
    REC:'REC',
    DESP:'DES', DES:'DES',
    AGE:'AGE',
    TER:'TER'
  });
  const OFFICIAL_PATTERN = /^[A-Z]{3}-\d{6}$/;

  function normalizePrefix(prefix){
    const value=String(prefix||'').trim().toUpperCase();
    return PREFIX_ALIASES[value]||value;
  }

  function sequenceFrom(value){
    if(value===null||value===undefined)return null;
    if(typeof value==='number'&&Number.isFinite(value))return Math.trunc(value);
    const digits=String(value).replace(/\D/g,'');
    if(!digits)return null;
    const sequence=Number(digits);
    return Number.isSafeInteger(sequence)?sequence:null;
  }

  function formatEntityCode(prefix,sequence){
    const normalizedPrefix=normalizePrefix(prefix);
    const numeric=Number(sequence);
    if(!OFFICIAL_PREFIXES.includes(normalizedPrefix))throw new Error(`Prefixo de identificador inválido: ${prefix}`);
    if(!Number.isInteger(numeric)||numeric<0||numeric>999999)throw new Error(`Sequência inválida para ${normalizedPrefix}.`);
    return `${normalizedPrefix}-${String(numeric).padStart(6,'0')}`;
  }

  function parseEntityCode(value,expectedPrefix=''){
    const raw=String(value??'').trim();
    if(!raw)return null;
    const expected=expectedPrefix?normalizePrefix(expectedPrefix):'';
    const upper=raw.toUpperCase();
    const prefixMatch=upper.match(/^\s*([A-Z]{2,4})/);
    const detected=prefixMatch?normalizePrefix(prefixMatch[1]):'';
    const prefix=expected||detected;
    if(!prefix||!OFFICIAL_PREFIXES.includes(prefix))return null;
    if(expected&&detected&&detected!==expected)return null;

    let numberSource=upper;
    if(prefixMatch)numberSource=upper.slice(prefixMatch[0].length);
    const digits=numberSource.replace(/\D/g,'');
    if(!digits||digits.length>9)return null;
    const sequence=Number(digits);
    if(!Number.isInteger(sequence)||sequence<0||sequence>999999)return null;
    return {raw,prefix,sequence,canonical:formatEntityCode(prefix,sequence),official:OFFICIAL_PATTERN.test(upper)};
  }

  function normalizeEntityCode(value,expectedPrefix=''){
    const parsed=parseEntityCode(value,expectedPrefix);
    return parsed?parsed.canonical:'';
  }

  function getNextEntityCode(prefix,collection=[],field='id',highWatermark=0){
    const normalizedPrefix=normalizePrefix(prefix);
    let max=Math.max(0,Number(highWatermark)||0);
    for(const item of collection||[]){
      const raw=typeof item==='string'?item:(item?.[field]??item?.id??item?.code);
      const parsed=parseEntityCode(raw,normalizedPrefix);
      if(parsed)max=Math.max(max,parsed.sequence);
    }
    if(max>=999999)throw new Error(`A sequência de ${normalizedPrefix} atingiu o limite de 999999.`);
    return formatEntityCode(normalizedPrefix,max+1);
  }

  function extractEntityCode(value,expectedPrefix=''){
    const text=String(value||'');
    const aliases=expectedPrefix
      ? Object.keys(PREFIX_ALIASES).filter(key=>PREFIX_ALIASES[key]===normalizePrefix(expectedPrefix))
      : Object.keys(PREFIX_ALIASES);
    const prefixPart=aliases.sort((a,b)=>b.length-a.length).join('|');
    const re=new RegExp(`(?:${prefixPart})[\\s_\\-/:]*(?:\\d[\\s_\\-]*){1,9}`,'i');
    const match=text.match(re);
    if(!match)return '';
    return normalizeEntityCode(match[0],expectedPrefix||'');
  }

  function codeMatches(value,query,expectedPrefix=''){
    const canonical=normalizeEntityCode(value,expectedPrefix);
    if(!canonical)return false;
    const raw=String(query||'').trim();
    if(!raw)return true;
    const queryCanonical=normalizeEntityCode(raw,expectedPrefix);
    if(queryCanonical)return canonical===queryCanonical;
    const digits=raw.replace(/\D/g,'');
    return digits?canonical.endsWith(digits.padStart(Math.min(6,digits.length),'0')):canonical.includes(raw.toUpperCase());
  }

  window.MarcoIdentifiers={
    OFFICIAL_PREFIXES,
    PREFIX_ALIASES,
    OFFICIAL_PATTERN,
    normalizePrefix,
    sequenceFrom,
    formatEntityCode,
    parseEntityCode,
    normalizeEntityCode,
    getNextEntityCode,
    extractEntityCode,
    codeMatches
  };
})();

/* ===== js/services/phone.js ===== */
(() => {
  'use strict';

  const VALID_DDDS=new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99]);
  // DDD padrão da região do Marco. Quando o cliente digita o telefone sem DDD (8 ou 9 dígitos),
  // este código é adicionado automaticamente. O usuário pode sempre sobrescrever digitando o DDD
  // (ou o código de país) diretamente.
  const DEFAULT_DDD='17';

  function digitsOnly(value){return String(value??'').replace(/\D/g,'');}
  function invalid(original,error,digits=''){return {valid:false,error,original:String(original??''),digits};}

  function normalizeBrazilianPhone(value){
    const original=String(value??'').trim();
    if(!original)return invalid(original,'Informe um telefone com DDD.');

    // Código de país estrangeiro digitado explicitamente (ex.: +308...). Nesse caso não forçamos
    // o Brasil (+55): o número é aceito como internacional, exatamente como foi digitado.
    if(original.startsWith('+')){
      const foreignDigits=digitsOnly(original);
      if(foreignDigits&&!foreignDigits.startsWith('55')){
        if(foreignDigits.length<8)return invalid(original,'Informe um telefone internacional válido.',foreignDigits);
        const formatted=`+${foreignDigits}`;
        return {valid:true,type:'international',countryCode:'',areaCode:'',nationalNumber:foreignDigits,nationalDigits:foreignDigits,normalizedDigits:foreignDigits,e164:formatted,formatted,original};
      }
    }

    let digits=digitsOnly(original);
    if(!digits)return invalid(original,'Informe um telefone com DDD.');
    if(digits.startsWith('0055'))digits=digits.slice(2);

    let national='';
    if((digits.length===12||digits.length===13)&&digits.startsWith('55'))national=digits.slice(2);
    else if((digits.length===10||digits.length===11))national=digits;
    else if((digits.length===11||digits.length===12)&&digits.startsWith('0')){
      const candidate=digits.slice(1);
      const ddd=Number(candidate.slice(0,2));
      if((candidate.length===10||candidate.length===11)&&VALID_DDDS.has(ddd))national=candidate;
    }
    // Sem DDD: assume automaticamente o DDD padrão da região (17). O usuário pode revisar e trocar
    // livremente antes de salvar, ou já digitar o DDD/código de país desejado desde o início.
    else if(digits.length===8||digits.length===9)national=DEFAULT_DDD+digits;

    if(!national){
      if(digits.length<10)return invalid(original,'Informe um telefone com DDD.',digits);
      return invalid(original,'O telefone possui mais dígitos que o permitido. Revise o número.',digits);
    }
    if(![10,11].includes(national.length))return invalid(original,'Informe um telefone com DDD.',digits);

    const areaCode=national.slice(0,2),ddd=Number(areaCode),subscriber=national.slice(2);
    if(!VALID_DDDS.has(ddd))return invalid(original,'Informe um DDD brasileiro válido.',digits);
    if(national.length===11&&subscriber[0]!=='9')return invalid(original,'Celular com 11 dígitos deve começar com 9 após o DDD.',digits);

    const type=national.length===11?'mobile':'landline';
    const formatted=type==='mobile'
      ? `+55 (${areaCode}) ${subscriber.slice(0,5)}-${subscriber.slice(5)}`
      : `+55 (${areaCode}) ${subscriber.slice(0,4)}-${subscriber.slice(4)}`;
    const normalizedDigits=`55${national}`;
    return {
      valid:true,
      type,
      countryCode:'55',
      areaCode,
      nationalNumber:subscriber,
      nationalDigits:national,
      normalizedDigits,
      e164:`+${normalizedDigits}`,
      formatted,
      original
    };
  }

  function formatBrazilianPhone(value){const result=normalizeBrazilianPhone(value);return result.valid?result.formatted:String(value??'');}
  function whatsappDigits(value){const result=normalizeBrazilianPhone(value);return result.valid?result.normalizedDigits:'';}
  function maskPhoneForLog(value){const result=normalizeBrazilianPhone(value);if(!result.valid)return 'telefone inválido';if(result.type==='international')return `+*** ****${result.nationalNumber.slice(-4)}`;const tail=result.nationalNumber.slice(-4);return `+55 (${result.areaCode}) ${result.type==='mobile'?'9':'*'}****-${tail}`;}

  window.MarcoPhone={VALID_DDDS,DEFAULT_DDD,digitsOnly,normalizeBrazilianPhone,formatBrazilianPhone,whatsappDigits,maskPhoneForLog};
})();

/* ===== js/services/money.js ===== */
(() => {
  'use strict';
  const MONEY_NAMES=new Set(['price','cost','salePrice','newCost','newPrice','value','fee','discount','unitPrice','subtotal','grossValue','netValue','amount','total']);
  const moneyClass=/\b(money|currency|price|cost|value|fee|discount|total|subtotal)\b/i;
  const digits=value=>String(value??'').replace(/\D/g,'');
  function parseToCents(value,{plainDigitsAreCents=false}={}){
    if(typeof value==='number'&&Number.isFinite(value))return Math.round(value*100);
    const raw=String(value??'').trim();if(!raw)return 0;
    if(plainDigitsAreCents&&/^\d+$/.test(raw))return Number(raw)||0;
    const clean=raw.replace(/R\$/gi,'').replace(/\s/g,'');
    if(/^[-+]?\d+$/.test(clean))return plainDigitsAreCents?(Number(clean)||0):Math.round((Number(clean)||0)*100);
    let normalized=clean;
    const comma=normalized.lastIndexOf(','),dot=normalized.lastIndexOf('.');
    if(comma>=0&&comma>dot)normalized=normalized.replace(/\./g,'').replace(',','.');
    else if(dot>=0&&dot>comma){
      const decimals=normalized.length-dot-1;
      normalized=decimals===3&&normalized.indexOf('.')===dot?normalized.replace(/\./g,''):normalized.replace(/,/g,'');
    }
    normalized=normalized.replace(/[^\d.-]/g,'');
    const n=Number(normalized);return Number.isFinite(n)?Math.round(n*100):0;
  }
  const parseNumber=value=>parseToCents(value)/100;
  const formatCents=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
  const formatNumber=value=>formatCents(Math.round((Number(value)||0)*100));
  function isMoneyInput(input){
    if(!(input instanceof HTMLInputElement))return false;
    if(input.dataset.money==='true'||input.matches('[data-money-input]'))return true;
    if(input.dataset.money==='false')return false;
    const name=input.name||input.dataset.paymentField||input.dataset.itemField||'';
    if(MONEY_NAMES.has(name)||moneyClass.test(name))return true;
    const label=input.closest('label,.field,.money-field')?.textContent||'';
    return /valor|preço|custo|taxa|desconto|subtotal|total/i.test(label)&&!/quantidade|estoque|margem|telefone|cep|cpf|cnpj/i.test(label);
  }
  function setCents(input,cents,{touch=false}={}){
    if(!input)return;const safe=Math.max(0,Math.round(Number(cents)||0));input.dataset.moneyCents=String(safe);input.value=formatCents(safe);if(touch)input.dataset.moneyTouched='true';
  }
  const getCents=input=>input?Math.max(0,Math.round(Number(input.dataset.moneyCents||parseToCents(input.value))||0)):0;
  const getValue=input=>getCents(input)/100;
  const setValue=(input,value,opts)=>setCents(input,Math.round((Number(value)||0)*100),opts);
  function bind(input){
    if(!isMoneyInput(input)||input.dataset.moneyBound==='true')return input;
    input.dataset.moneyBound='true';input.dataset.money='true';input.type='text';input.inputMode='numeric';input.autocomplete='off';
    setCents(input,parseToCents(input.value));
    input.addEventListener('focus',()=>{requestAnimationFrame(()=>input.setSelectionRange(input.value.length,input.value.length));});
    input.addEventListener('keydown',event=>{
      if(event.ctrlKey||event.metaKey||event.altKey||['Tab','Enter','Escape','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const hasSelection=typeof input.selectionStart==='number'&&typeof input.selectionEnd==='number'&&input.selectionStart!==input.selectionEnd;
      if(/^\d$/.test(event.key)){event.preventDefault();const current=hasSelection?'':digits(input.value),next=(current===''||current==='000'?event.key:current+event.key).replace(/^0+(?=\d)/,'');setCents(input,Number(next)||0,{touch:true});input.dispatchEvent(new Event('input',{bubbles:true}));return;}
      if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();const current=hasSelection?'':digits(input.value),next=hasSelection?'':current.slice(0,-1);setCents(input,Number(next)||0,{touch:true});input.dispatchEvent(new Event('input',{bubbles:true}));return;}
      event.preventDefault();
    });
    input.addEventListener('paste',event=>{event.preventDefault();const text=event.clipboardData?.getData('text')||'';const hasDecimal=/[,.]\d{1,2}\s*$/.test(text)||/R\$/i.test(text);setCents(input,parseToCents(text,{plainDigitsAreCents:!hasDecimal}),{touch:true});input.dispatchEvent(new Event('input',{bubbles:true}));});
    input.addEventListener('input',()=>{
      if(input.dataset.moneyInternal==='true')return;
      const cents=parseToCents(input.value,{plainDigitsAreCents:true});input.dataset.moneyInternal='true';setCents(input,cents,{touch:true});input.dataset.moneyInternal='false';
    });
    return input;
  }
  function bindAll(root=document){
    const nodes=[];if(root instanceof HTMLInputElement)nodes.push(root);root?.querySelectorAll?.('input').forEach(x=>nodes.push(x));nodes.filter(isMoneyInput).forEach(bind);return nodes;
  }
  window.MarcoMoney={parseToCents,parseNumber,formatCents,formatNumber,isMoneyInput,bind,bindAll,getCents,getValue,setCents,setValue};
})();

/* ===== js/services/finance-status.js ===== */
(() => {
  'use strict';
  function localDay(date=new Date()){const p=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}`;}
  function dateOnly(value){const raw=String(value||'').trim();const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`;const br=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);return br?`${br[3]}-${br[2]}-${br[1]}`:'';}
  function effectiveStatus(payment={},at=new Date()){
    const stored=String(payment.status||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(payment.cancelled===true||stored==='cancelado'||stored==='cancelada')return 'Cancelado';
    if(dateOnly(payment.paymentDate))return 'Pago';
    const due=dateOnly(payment.dueDate);if(due)return due<localDay(at)?'Vencido':'Em aberto — aguardando pagamento';
    return 'Em aberto';
  }
  function tone(status){const value=String(status||'').toLowerCase();if(value==='pago')return 'ok';if(value==='vencido')return 'danger';if(value==='cancelado')return 'neutral';return 'warn';}
  window.MarcoFinanceStatus={effectiveStatus,tone,localDay,dateOnly};
})();

/* ===== js/services/stock-health.js ===== */
(() => {
  'use strict';
  function getStockHealth(stock,minimumStock){
    const current=Number(stock);const minRaw=minimumStock;
    if(minRaw===''||minRaw===null||minRaw===undefined||!Number.isFinite(Number(minRaw)))return {level:'unset',label:'Mínimo não configurado',tone:'neutral',priority:4};
    const minimum=Number(minRaw);if(!Number.isFinite(current))return {level:'unset',label:'Mínimo não configurado',tone:'neutral',priority:4};
    if(current<=minimum)return {level:'critical',label:'Crítico',tone:'danger',priority:current<0?0:current===0?1:2};
    if(current-minimum<=1)return {level:'warning',label:'Atenção',tone:'warn',priority:3};
    return {level:'normal',label:'Normal',tone:'ok',priority:5};
  }
  window.MarcoStockHealth={getStockHealth};
})();

/* ===== js/services/google-drive.js ===== */
(() => {
  'use strict';
  const DEFAULT_CLIENT_ID='946105310952-gp143h81mm3704lrq3877hsie49njgak.apps.googleusercontent.com';
  const DEFAULT_API_KEY='AIzaSyDhIJJ7XgvJC1i6NzylSZI2vs3RuvuRjn4';
  const DEFAULT_PROJECT_NUMBER='946105310952';
  const SCOPES='openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/drive.file';
  const ALLOWED_ACCOUNT_HASHES=new Set(['134e106b0600045a12cf9722057a06fad862df6d45b5fece1eb7180729569ea2','db9c91e0d2956a89a70d9683b4a2a4d048b9cde255f861425342fe877b48339c']);
  const DATA_FILE='Marco_Iris_Dados.json';
  const SecureVault=window.SecureJsonVault.forApp({
    appId:'marco-iris-tecnologia',
    appName:'Marco Iris Tecnologia',
    dialogTheme:'marco',
    credentialGroup:'marco-iris-suite',
    googleOnlyAccess:true,
    isSensitive:value=>!!(value&&typeof value==='object'&&value.appId==='marco-iris-tecnologia'&&value.dataByProfile)
  });
  const IntegrationVault=window.SecureJsonVault.forApp({
    appId:'borion-ecosystem-integration',
    appName:'Integracao segura Borion',
    dialogTheme:'marco',
    credentialGroup:'marco-iris-suite',
    googleOnlyAccess:true,
    autoDownloadRecovery:false,
    isSensitive:value=>!!(value&&typeof value==='object'&&(value.schema==='borion.interop.snapshot'||value.schema==='borion.interop.ack'))
  });
  const DATA_FILE_ID_PREFIX='marco_iris_v240_gdrive_data_file_';
  const USER_KEY='marco_iris_v240_gdrive_user';
  const ROOT_PREFIX='marco_iris_v240_gdrive_root_';
  const STRUCT_PREFIX='marco_iris_v240_gdrive_structure_';
  const LAST_SAVE='marco_iris_v240_last_google_save';
  const FOLDERS={data:'Dados',backups:'Backups',photos:'Fotos_OS',pdfs:'Ordens_de_Servico',attachments:'Anexos',integration:'Borion_Integracoes'};
  const AUTOSAVE_SLOTS=20;
  const FORCESAVE_SLOTS=20;
  const AUTOSAVE_INTERVAL_MS=60*1000;
  const BACKUP_SLOT_PREFIX='marco_iris_v240_backup_slot_';
  const ENCRYPTED_BACKUPS_MARKER_PREFIX='marco_iris_encrypted_backups_v1_';
  const ENCRYPTED_BACKUPS_QUEUE_PREFIX='marco_iris_encrypted_backups_queue_v2_';
  const INSTALLATION_FILE='Marco_Iris_Instalacao.json';
  let structurePromise=null;
  let connectionPromise=null;
  let primaryEncryptionTimer=null;
  let backupEncryptionTimer=null;
  let encryptionMigrationInFlight=false;
  const integrationFileIds=new Map();
  const integrationFilePromises=new Map();
  const dataFilePromises=new Map();


  function jsonClone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object'){const out={};Object.keys(value).sort().forEach(k=>{if(k!=='integrity')out[k]=canonical(value[k]);});return out;}return value;}
  async function stateChecksum(state){const text=JSON.stringify(canonical(state));const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
  async function contentChecksum(state){const clean=jsonClone(state||{});delete clean.driveSync;delete clean.updatedAt;delete clean.integrity;const bridge=clean?.interconnections?.borion;if(bridge&&typeof bridge==='object'){delete bridge.deviceId;delete bridge.lastPublishAt;delete bridge.lastPublishStatus;delete bridge.lastError;}const text=JSON.stringify(canonical(clean));const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
  function valueEqual(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}
  function itemKey(item,index=0){return String(item?.id||item?.code||item?.key||item?.sourceRecordId||item?.aggregateId||`__index_${index}`);}
  function mergeArrayDelta(baseArr,localArr,remoteArr){
    const base=Array.isArray(baseArr)?baseArr:[],local=Array.isArray(localArr)?localArr:[],remote=Array.isArray(remoteArr)?remoteArr:[];
    const bm=new Map(base.map((item,index)=>[itemKey(item,index),item])),lm=new Map(local.map((item,index)=>[itemKey(item,index),item])),rm=new Map(remote.map((item,index)=>[itemKey(item,index),jsonClone(item)]));
    const order=remote.map((item,index)=>itemKey(item,index));
    for(const [key,baseItem] of bm){
      if(!lm.has(key)){rm.delete(key);continue;}
      const localItem=lm.get(key);if(!valueEqual(localItem,baseItem))rm.set(key,jsonClone(localItem));
    }
    for(const [key,localItem] of lm){if(!bm.has(key)){rm.set(key,jsonClone(localItem));if(!order.includes(key))order.push(key);}}
    return [...order.filter((key,index)=>order.indexOf(key)===index&&rm.has(key)).map(key=>rm.get(key)),...[...rm.entries()].filter(([key])=>!order.includes(key)).map(([,item])=>item)];
  }
  function mergeObjectDelta(base,local,remote){
    if(Array.isArray(base)||Array.isArray(local)||Array.isArray(remote))return mergeArrayDelta(base,local,remote);
    if(!local||typeof local!=='object'||!remote||typeof remote!=='object'||!base||typeof base!=='object')return !valueEqual(local,base)?jsonClone(local):jsonClone(remote);
    const out=jsonClone(remote);
    for(const key of new Set([...Object.keys(base),...Object.keys(local)])){
      if(!(key in local)){delete out[key];continue;}
      if(!(key in base)){out[key]=jsonClone(local[key]);continue;}
      if(valueEqual(local[key],base[key]))continue;
      if(local[key]&&typeof local[key]==='object'&&base[key]&&typeof base[key]==='object'&&remote[key]&&typeof remote[key]==='object')out[key]=mergeObjectDelta(base[key],local[key],remote[key]);
      else out[key]=jsonClone(local[key]);
    }
    return out;
  }
  function rebaseLocalChanges(baseState,localState,remoteState){
    if(!baseState||!localState||!remoteState)throw new Error('Não foi possível reconciliar as alterações entre dispositivos sem a base de sincronização.');
    const merged=mergeObjectDelta(baseState,localState,remoteState);
    merged.driveSync=jsonClone(remoteState.driveSync||{});
    merged.updatedAt=String(localState.updatedAt||remoteState.updatedAt||new Date().toISOString());
    ensureCompanyId(merged);
    return merged;
  }
  const SOURCE_COLLECTIONS=['clients','serviceOrders','orderItems','payments','products','services','supplies','stockMovements','appointments','consents'];
  function sourceCount(state){let total=0;for(const d of Object.values(state?.dataByProfile||{})){if(!d||typeof d!=='object')continue;for(const k of SOURCE_COLLECTIONS)total+=Array.isArray(d[k])?d[k].length:0;}return total;}
  function explicitLocalDeletionCoverage(localState,remoteState){
    const tombstones=localState?.interconnections?.borion?.tombstones;
    if(!Array.isArray(tombstones)||!tombstones.length)return false;
    const tombstoneKeys=new Set(tombstones.flatMap(item=>[String(item?.sourceRecordId||''),String(item?.entityId||''),String(item?.aggregateId||'')]).filter(Boolean));
    let missing=0;
    for(const [profileId,remoteData] of Object.entries(remoteState?.dataByProfile||{})){
      const localData=localState?.dataByProfile?.[profileId]||{};
      for(const collection of SOURCE_COLLECTIONS){
        const localIds=new Set((localData?.[collection]||[]).map(item=>String(item?.id||item?.code||'')).filter(Boolean));
        for(const item of (remoteData?.[collection]||[])){
          const entityId=String(item?.code||item?.id||'').trim();
          if(entityId&&localIds.has(entityId))continue;
          missing++;
          if(collection!=='payments'||!entityId)return false;
          const normalized=String(item?.type||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
          const kind=normalized==='despesa'?'expense':'receipt';
          const sourceRecordId=`marco:${kind}:${entityId}`;
          if(!tombstoneKeys.has(sourceRecordId)&&!tombstoneKeys.has(entityId))return false;
        }
      }
    }
    return missing>0;
  }
  function companyIdOf(state){return String(state?.interconnections?.borion?.companyInstanceId||state?.interconnections?.borion?.instanceId||'').trim();}
  function ensureCompanyId(state){
    if(!state.interconnections||typeof state.interconnections!=='object')state.interconnections={};
    if(!state.interconnections.borion||typeof state.interconnections.borion!=='object')state.interconnections.borion={};
    const b=state.interconnections.borion;let id=String(b.companyInstanceId||b.instanceId||'').trim();
    if(!id)id=(globalThis.crypto?.randomUUID?.()||('company_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)));
    b.companyInstanceId=id;b.instanceId=id;return id;
  }
  function validateOfficialState(state){
    const errors=[];
    if(!state||typeof state!=='object'||Array.isArray(state))errors.push('JSON raiz inválido.');
    if(!Array.isArray(state?.profiles))errors.push('Lista de perfis ausente.');
    if(!state?.dataByProfile||typeof state.dataByProfile!=='object')errors.push('dataByProfile ausente.');
    if(state?.profiles?.length&&!Object.keys(state.dataByProfile||{}).length)errors.push('Perfis sem base de dados correspondente.');
    return {valid:errors.length===0,errors,count:sourceCount(state)};
  }
  async function prepareOfficialState(state,remoteState=null){
    const next=jsonClone(state||{});ensureCompanyId(next);const currentRev=Math.max(0,Number(next?.driveSync?.revision)||0),remoteRev=Math.max(0,Number(remoteState?.driveSync?.revision)||0);
    next.driveSync=Object.assign({},next.driveSync||{},{schemaVersion:1,companyInstanceId:companyIdOf(next),revision:Math.max(currentRev,remoteRev)+1,previousRevision:remoteRev,updatedByDevice:window.MarcoBorionInterop?.getRuntimeStatus?.().deviceId||'',updatedAt:new Date().toISOString()});
    next.updatedAt=new Date().toISOString();next.driveSync.checksum=await stateChecksum(next);return next;
  }
  function assertSafeReplacement(sessionState,remoteState){
    const sessionCheck=validateOfficialState(sessionState),remoteCheck=validateOfficialState(remoteState);
    if(!sessionCheck.valid)throw new Error('A sessão atual é inválida: '+sessionCheck.errors.join(' '));
    if(!remoteCheck.valid)throw new Error('A base oficial do Drive é inválida: '+remoteCheck.errors.join(' '));
    const sc=companyIdOf(sessionState),rc=companyIdOf(remoteState);
    if(rc&&sc&&rc!==sc){const e=new Error('Conflito de instalação: o identificador oficial da empresa é diferente. Nenhum dado foi enviado.');e.code='COMPANY_INSTANCE_CONFLICT';throw e;}
    const known=Math.max(0,Number(sessionState?.driveSync?.revision)||0),remoteRev=Math.max(0,Number(remoteState?.driveSync?.revision)||0);
    if(remoteRev>known){const e=new Error('O Google Drive possui uma revisão mais nova. A alteração será conciliada com a base oficial.');e.code='REMOTE_NEWER';throw e;}
    return true;
  }

  function config(){
    return {clientId:DEFAULT_CLIENT_ID,apiKey:DEFAULT_API_KEY,projectNumber:DEFAULT_PROJECT_NUMBER};
  }
  function validateConfig(){const c=config();if(!c.clientId||!c.apiKey||!c.projectNumber)throw new Error('A conexão com o Google Drive não está disponível nesta versão do aplicativo.');return c;}
  const Auth={token:'',expiresAt:0,user:null,gisLoaded:false,pickerLoaded:false,tokenClient:null,
    loadScript(src){return new Promise((resolve,reject)=>{if(document.querySelector(`script[src="${src}"]`)){resolve();return;}const s=document.createElement('script');s.src=src;s.async=true;s.defer=true;s.onload=resolve;s.onerror=()=>reject(new Error('Não foi possível carregar os serviços do Google.'));document.head.appendChild(s);});},
    async libraries(){if(!this.gisLoaded){await this.loadScript('https://accounts.google.com/gsi/client');this.gisLoaded=true;}if(!this.pickerLoaded){await this.loadScript('https://apis.google.com/js/api.js');await new Promise(r=>gapi.load('picker',r));this.pickerLoaded=true;}},
    async request(interactive=false){const cfg=validateConfig();await this.libraries();return await new Promise((resolve,reject)=>{this.tokenClient=google.accounts.oauth2.initTokenClient({client_id:cfg.clientId,scope:SCOPES,callback:r=>{if(r.error){reject(new Error(`O Google recusou o acesso: ${r.error}`));return;}this.token=r.access_token;this.expiresAt=Date.now()+((r.expires_in||3300)*1000);resolve(this.token);},error_callback:e=>reject(new Error(e?.message||'Login com Google cancelado.'))});this.tokenClient.requestAccessToken({prompt:interactive?'select_account':''});});},
    async ensure(interactive=false){if(this.token&&Date.now()<this.expiresAt-60000)return this.token;return await this.request(interactive);},
    async fetchUser(){const r=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${this.token}`}});if(!r.ok)throw new Error('Não foi possível confirmar a conta Google.');const i=await r.json();this.user={sub:i.sub,email:i.email,name:i.name||i.email,picture:i.picture||''};localStorage.setItem(USER_KEY,JSON.stringify(this.user));return this.user;},
    cached(){if(this.user)return this.user;try{this.user=JSON.parse(localStorage.getItem(USER_KEY)||'null');}catch(_){this.user=null;}return this.user;},
    signOut(){if(this.token){try{google.accounts.oauth2.revoke(this.token,()=>{});}catch(_){}}this.token='';this.expiresAt=0;this.user=null;localStorage.removeItem(USER_KEY);}
  };
  async function accountHash(email){const normalized=String(email||'').trim().toLowerCase();if(!normalized||!globalThis.crypto?.subtle)return '';const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
  async function assertAuthorizedUser(user){const hash=await accountHash(user?.email);if(!hash||!ALLOWED_ACCOUNT_HASHES.has(hash)){Auth.signOut();throw new Error('Esta conta Google não está autorizada a acessar o Marco Iris Tecnologia.');}await SecureVault.bindOwner(user.sub);await IntegrationVault.bindOwner('borion-ecosystem-integration-v1');return user;}
  async function authenticateGoogle(interactive=true){await Auth.ensure(interactive);return await assertAuthorizedUser(await Auth.fetchUser());}
  async function headers(json=false){const token=await Auth.ensure(false);return json?{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}:{Authorization:`Bearer ${token}`};}
  function safeQuery(v){return String(v).replace(/\\/g,"\\\\").replace(/'/g,"\\'");}
  async function findChildren(parentId,name,mimeType=''){
    let q=`'${parentId}' in parents and name='${safeQuery(name)}' and trashed=false`;if(mimeType)q+=` and mimeType='${mimeType}'`;
    const params=new URLSearchParams({q,orderBy:'createdTime asc',pageSize:'100',fields:'files(id,name,mimeType,createdTime,modifiedTime,size,parents,trashed,webViewLink,webContentLink,thumbnailLink)'});
    const r=await fetch(`https://www.googleapis.com/drive/v3/files?${params}`,{headers:await headers()});
    if(!r.ok)throw new Error('Falha ao consultar o Google Drive.');const result=await r.json();return Array.isArray(result.files)?result.files:[];
  }
  async function findChild(parentId,name,mimeType=''){
    const files=await findChildren(parentId,name,mimeType);if(files.length>1)console.warn(`[GOOGLE_DRIVE] Existem ${files.length} itens chamados “${name}”. O mais antigo será reutilizado.`);return files[0]||null;
  }
  async function listChildren(parentId,mimeType=''){
    let q=`'${parentId}' in parents and trashed=false`;if(mimeType)q+=` and mimeType='${mimeType}'`;
    const params=new URLSearchParams({q,orderBy:'modifiedTime desc',pageSize:'1000',fields:'files(id,name,mimeType,createdTime,modifiedTime,size,parents,trashed)'});
    const r=await fetch(`https://www.googleapis.com/drive/v3/files?${params}`,{headers:await headers()});
    if(!r.ok)throw new Error('Falha ao listar os backups no Google Drive.');
    const result=await r.json();return Array.isArray(result.files)?result.files:[];
  }
  async function createMetadata(meta){const r=await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,createdTime,modifiedTime,size,parents,trashed,webViewLink,webContentLink',{method:'POST',headers:await headers(true),body:JSON.stringify(meta)});if(!r.ok)throw new Error(`Falha ao criar “${meta.name}” no Google Drive.`);return await r.json();}
  async function createFolder(parentId,name){return await createMetadata({name,mimeType:'application/vnd.google-apps.folder',parents:[parentId]});}
  async function uploadMediaContent(fileId,blob){const r=await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,mimeType,modifiedTime,size,webViewLink,webContentLink,thumbnailLink`,{method:'PATCH',headers:{...(await headers()),'Content-Type':blob.type||'application/octet-stream'},body:blob});if(!r.ok)throw new Error('Falha ao enviar o arquivo para o Google Drive.');return await r.json();}
  async function updateJson(fileId,obj){const protectedObject=await SecureVault.protect(obj);const result=await uploadMediaContent(fileId,new Blob([JSON.stringify(protectedObject,null,2)],{type:'application/json'}));await SecureVault.confirmSetupPersisted?.(SecureVault.status?.().vaultId||'');return result;}
  async function readJson(fileId){const r=await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,{headers:await headers()});if(!r.ok)throw new Error('Falha ao carregar os dados do Google Drive.');return await SecureVault.open(await r.json(),{prepare:false});}
  function deviceIsMobile(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'')||!!window.matchMedia?.('(pointer: coarse)')?.matches;}
  function foregroundSavePending(){return saveQueueCompleted<saveQueueRequested||!!saveQueuePromise;}
  function readBackupEncryptionQueue(folderId){try{const q=JSON.parse(localStorage.getItem(ENCRYPTED_BACKUPS_QUEUE_PREFIX+folderId)||'null');return Array.isArray(q)?q.filter(item=>item?.id&&item?.name):null;}catch(_){return null;}}
  function writeBackupEncryptionQueue(folderId,queue){localStorage.setItem(ENCRYPTED_BACKUPS_QUEUE_PREFIX+folderId,JSON.stringify(queue));}
  function schedulePrimaryEncryptionMigration(folderId,file,state,delay=10000){
    if(!SecureVault.needsMigration()){scheduleBackupEncryptionMigration(folderId);return;}
    if(primaryEncryptionTimer)clearTimeout(primaryEncryptionTimer);
    primaryEncryptionTimer=setTimeout(async()=>{
      primaryEncryptionTimer=null;
      if(!SecureVault.needsMigration()){scheduleBackupEncryptionMigration(folderId);return;}
      if(encryptionMigrationInFlight||foregroundSavePending()){schedulePrimaryEncryptionMigration(folderId,file,state,15000);return;}
      encryptionMigrationInFlight=true;
      try{
        const latest=await meta(file.id);
        if(file.modifiedTime&&latest.modifiedTime&&file.modifiedTime!==latest.modifiedTime)throw new Error('A base foi atualizada durante a espera; a migracao usara a revisao mais nova no proximo ciclo.');
        const updated=await updateJson(file.id,state),confirmed=await readJson(file.id),check=validateOfficialState(confirmed);
        if(!check.valid)throw new Error('A conversao criptografada da base principal nao foi confirmada.');
        SecureVault.markMigrated();
        Drive.currentFile=updated;
        scheduleBackupEncryptionMigration(folderId,15000);
      }catch(error){
        console.warn('[MarcoDrive] A abertura continuou normalmente; a criptografia sera retomada sem bloquear o aplicativo:',error);
        schedulePrimaryEncryptionMigration(folderId,file,state,60000);
      }finally{encryptionMigrationInFlight=false;}
    },delay);
  }
  function scheduleBackupEncryptionMigration(folderId,delay=30000){
    if(localStorage.getItem(ENCRYPTED_BACKUPS_MARKER_PREFIX+folderId)==='1'||deviceIsMobile())return;
    if(backupEncryptionTimer)clearTimeout(backupEncryptionTimer);
    backupEncryptionTimer=setTimeout(()=>{backupEncryptionTimer=null;migrateBackupEncryption(folderId).catch(error=>{console.warn('[MarcoDrive] Um backup antigo sera tentado novamente mais tarde:',error);scheduleBackupEncryptionMigration(folderId,120000);});},delay);
  }
  async function migrateBackupEncryption(folderId){
    if(encryptionMigrationInFlight||foregroundSavePending()){scheduleBackupEncryptionMigration(folderId,30000);return 0;}
    encryptionMigrationInFlight=true;
    try{
      let files=readBackupEncryptionQueue(folderId);
      if(files===null){files=await listChildren(folderId,'application/json');writeBackupEncryptionQueue(folderId,files.map(file=>({id:file.id,name:file.name})));}
      const file=files[0];
      if(!file){localStorage.setItem(ENCRYPTED_BACKUPS_MARKER_PREFIX+folderId,'1');localStorage.removeItem(ENCRYPTED_BACKUPS_QUEUE_PREFIX+folderId);return 0;}
      let migrated=0;
      const response=await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,{headers:await headers()});
      if(!response.ok)throw new Error(`Falha ao verificar a criptografia do backup ${file.name}.`);
      const raw=await response.json();
      if(!SecureVault.isEnvelope(raw)&&SecureVault.isSensitive(raw)){await updateJson(file.id,raw);const verify=await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,{headers:await headers()});const confirmed=verify.ok?await verify.json():null;if(!SecureVault.isEnvelope(confirmed))throw new Error(`A criptografia do backup ${file.name} nao foi confirmada.`);migrated=1;}
      files.shift();writeBackupEncryptionQueue(folderId,files);scheduleBackupEncryptionMigration(folderId,30000);return migrated;
    }finally{encryptionMigrationInFlight=false;}
  }
  async function meta(fileId){const r=await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,createdTime,modifiedTime,size,parents,trashed,webViewLink,webContentLink,thumbnailLink`,{headers:await headers()});if(!r.ok){const e=new Error('Falha ao consultar o arquivo no Google Drive.');e.status=r.status;throw e;}return await r.json();}
  async function downloadBlob(fileId){const r=await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,{headers:await headers()});if(!r.ok)throw new Error('Falha ao baixar o arquivo do Google Drive.');return await r.blob();}
  async function trash(fileId){const r=await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`,{method:'PATCH',headers:await headers(true),body:JSON.stringify({trashed:true})});if(!r.ok)throw new Error('Falha ao mover o arquivo para a lixeira do Drive.');return true;}
  function rootKey(sub){return `${ROOT_PREFIX}${sub}`;}function structKey(root){return `${STRUCT_PREFIX}${root}`;}
  function rootId(){const u=Auth.cached();return u?localStorage.getItem(rootKey(u.sub))||'':'';}
  function setRoot(id){const u=Auth.cached();if(u)localStorage.setItem(rootKey(u.sub),id);}
  function clearRoot(){const u=Auth.cached(),root=rootId();if(u)localStorage.removeItem(rootKey(u.sub));if(root)localStorage.removeItem(structKey(root));}
  function cachedStructure(){const root=rootId();if(!root)return null;try{return JSON.parse(localStorage.getItem(structKey(root))||'null');}catch(_){return null;}}
  function setStructure(v){if(v?.rootId)localStorage.setItem(structKey(v.rootId),JSON.stringify(v));}
  function picker(){return new Promise((resolve,reject)=>{const cfg=validateConfig(),view=new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true).setIncludeFolders(true).setMimeTypes('application/vnd.google-apps.folder');const p=new google.picker.PickerBuilder().setTitle('Escolha a pasta principal da Marco Iris').addView(view).setOAuthToken(Auth.token).setDeveloperKey(cfg.apiKey).setAppId(cfg.projectNumber).setCallback(d=>{if(d.action===google.picker.Action.PICKED)resolve(d.docs[0]);else if(d.action===google.picker.Action.CANCEL)reject(new Error('Nenhuma pasta foi selecionada.'));}).build();p.setVisible(true);});}
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  async function withCrossTabLock(name,task){
    if(navigator?.locks?.request)return await navigator.locks.request(name,task);
    const key=`marco_iris_v240_mutex_${encodeURIComponent(name)}`,token=`${Date.now()}_${Math.random().toString(36).slice(2)}`,deadline=Date.now()+30000;
    while(Date.now()<deadline){let current=null;try{current=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
      if(!current||Number(current.expiresAt)<Date.now()){localStorage.setItem(key,JSON.stringify({token,expiresAt:Date.now()+30000}));let confirmed=null;try{confirmed=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
        if(confirmed?.token===token){try{return await task();}finally{try{const latest=JSON.parse(localStorage.getItem(key)||'null');if(latest?.token===token)localStorage.removeItem(key);}catch(_){localStorage.removeItem(key);}}}}
      await sleep(120+Math.floor(Math.random()*120));
    }
    throw new Error('Outra aba ainda está preparando as pastas do Google Drive. Feche as abas duplicadas e tente novamente.');
  }
  function validFolder(info,root,name){return !!info&&!info.trashed&&info.mimeType==='application/vnd.google-apps.folder'&&info.name===name&&(info.parents||[]).includes(root);}
  async function validateStructure(root,c){
    if(!c||c.rootId!==root)return null;const normalized={rootId:root};
    for(const [key,name] of Object.entries(FOLDERS)){const id=c[key];if(!id)return null;try{const info=await meta(id);if(!validFolder(info,root,name))return null;normalized[key]=id;}catch(_){return null;}}
    return normalized;
  }
  async function ensureStructure(force=false){
    const root=rootId();if(!root)throw new Error('Escolha primeiro uma pasta do Google Drive.');
    if(!force){const c=await validateStructure(root,cachedStructure());if(c)return c;}
    // V2.4.0 — antes, se a pasta RAIZ em si fosse excluída/movida pra lixeira (ex.:
    // reset manual pelo site do Drive), a referência nunca era invalidada sozinha:
    // toda tentativa de publicar falhava em silêncio pra sempre (o erro ficava só
    // em bridge.lastError, sem aviso claro). Agora confere a raiz primeiro; se ela
    // não existir mais, limpa a referência local e avisa com instrução clara.
    try{
      const rootInfo=await meta(root);
      if(rootInfo.trashed||rootInfo.mimeType!=='application/vnd.google-apps.folder'){
        clearRoot();
        throw new Error('A pasta principal do Google Drive foi excluída ou movida para a lixeira. Vá em Configurações → Backup e Migração, clique em "Desconectar" e depois "Conectar Google" de novo para escolher a pasta atual.');
      }
    }catch(error){
      if(error?.status===404){
        clearRoot();
        throw new Error('A pasta principal do Google Drive não foi encontrada (pode ter sido excluída). Vá em Configurações → Backup e Migração, clique em "Desconectar" e depois "Conectar Google" de novo para escolher a pasta atual.');
      }
      if(!Number.isFinite(error?.status))throw error;
    }
    if(structurePromise)return await structurePromise;
    structurePromise=withCrossTabLock(`marco-drive-structure:${root}`,async()=>{
      const stored=await validateStructure(root,cachedStructure());if(stored)return stored;
      const s={rootId:root};
      for(const [key,name] of Object.entries(FOLDERS)){
        let f=await findChild(root,name,'application/vnd.google-apps.folder');
        if(!f){for(const delay of [600,1400,2600]){await sleep(delay);f=await findChild(root,name,'application/vnd.google-apps.folder');if(f)break;}}
        if(!f)f=await createFolder(root,name);s[key]=f.id;setStructure(s);
      }
      setStructure(s);return s;
    }).finally(()=>{structurePromise=null;});
    return await structurePromise;
  }
  function stamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;}
  function integrationFileKey(folderId,name){const sub=Auth.cached()?.sub||'unknown';return `marco_iris_v240_gdrive_json_file_${sub}_${folderId}_${encodeURIComponent(name)}`;}
  async function resolveIntegrationFileUncached(folderId,name,create=false,obj=null){
    const memoryKey=`${folderId}:${name}`,storageKey=integrationFileKey(folderId,name);
    const cached=integrationFileIds.get(memoryKey)||localStorage.getItem(storageKey);
    if(cached){
      try{const info=await meta(cached);if(info.name===name&&info.mimeType==='application/json'){integrationFileIds.set(memoryKey,cached);return {id:cached,name};}}
      catch(_){integrationFileIds.delete(memoryKey);localStorage.removeItem(storageKey);}
    }
    let f=await findChild(folderId,name,'application/json');
    if(!f&&create){await sleep(450);f=await findChild(folderId,name,'application/json');if(!f)f=await createMetadata({name,mimeType:'application/json',parents:[folderId]});}
    if(f){integrationFileIds.set(memoryKey,f.id);localStorage.setItem(storageKey,f.id);}
    return f||null;
  }
  async function resolveIntegrationFile(folderId,name,create=false,obj=null){
    const memoryKey=`${folderId}:${name}`;if(integrationFilePromises.has(memoryKey))return await integrationFilePromises.get(memoryKey);
    const task=()=>resolveIntegrationFileUncached(folderId,name,create,obj);
    const promise=withCrossTabLock(`marco-drive-file:${folderId}:${name}`,task).finally(()=>integrationFilePromises.delete(memoryKey));
    integrationFilePromises.set(memoryKey,promise);return await promise;
  }

  function backupSlotKey(folderId,kind){return `${BACKUP_SLOT_PREFIX}${kind}_${folderId}`;}
  function readBackupSlot(folderId,kind,slots){const raw=Number(localStorage.getItem(backupSlotKey(folderId,kind))||0);return Number.isFinite(raw)&&raw>=0?raw%slots:0;}
  function writeBackupSlot(folderId,kind,slot){localStorage.setItem(backupSlotKey(folderId,kind),String(slot));}
  async function writeRotatingBackup(folderId,state,{kind='autosave',force=false}={}){
    if(!folderId||!state)return null;
    const slots=kind==='forcesave'?FORCESAVE_SLOTS:AUTOSAVE_SLOTS;
    const lastKey=`${BACKUP_SLOT_PREFIX}${kind}_last_${folderId}`;
    const lastAt=Number(localStorage.getItem(lastKey)||0);
    if(!force&&kind==='autosave'&&Date.now()-lastAt<AUTOSAVE_INTERVAL_MS)return null;
    const slot=readBackupSlot(folderId,kind,slots)+1;
    const name=`${kind}-${slot}.json`;
    const file=await resolveIntegrationFile(folderId,name,true,state);
    await updateJson(file.id,jsonClone(state));
    const confirmed=await readJson(file.id);
    const check=validateOfficialState(confirmed);
    if(!check.valid)throw new Error(`O backup ${name} não pôde ser confirmado no Google Drive.`);
    writeBackupSlot(folderId,kind,slot%slots);
    localStorage.setItem(lastKey,String(Date.now()));
    return {id:file.id,name,slot};
  }
  async function writeInstallationManifest(rootIdValue,structure,state,user){
    if(!rootIdValue||!structure||!state)return null;
    const manifest={schema:'marco.iris.installation',schemaVersion:1,appId:'marco-iris-tecnologia',appVersion:'2.8.3',createdOrUpdatedAt:new Date().toISOString(),companyInstanceId:companyIdOf(state),googleAccount:String(user?.email||''),rootFolderId:rootIdValue,folders:Object.fromEntries(Object.entries(FOLDERS).map(([key,name])=>[key,{name,id:structure[key]||''}]))};
    const file=await resolveIntegrationFile(rootIdValue,INSTALLATION_FILE,true,manifest);
    await updateJson(file.id,manifest);
    const confirmed=await readJson(file.id);
    if(confirmed?.companyInstanceId!==manifest.companyInstanceId)throw new Error('O manifesto da instalação não pôde ser confirmado no Google Drive.');
    return {file,manifest:confirmed};
  }

  function dataFileKey(folderId){return `${DATA_FILE_ID_PREFIX}${folderId}`;}
  function rememberDataFile(folderId,file){if(file?.id)localStorage.setItem(dataFileKey(folderId),file.id);return file||null;}
  function forgetDataFile(folderId){localStorage.removeItem(dataFileKey(folderId));}
  function validDataFile(info,folderId){return !!info&&!info.trashed&&info.name===DATA_FILE&&info.mimeType==='application/json'&&(info.parents||[]).includes(folderId);}
  async function resolveDataFileUncached(folderId){
    const cachedId=localStorage.getItem(dataFileKey(folderId));
    if(cachedId){
      try{const info=await meta(cachedId);if(validDataFile(info,folderId))return rememberDataFile(folderId,info);}catch(error){if(![403,404].includes(error?.status))console.warn('[GOOGLE_DRIVE] Arquivo principal em cache inválido:',error);}
      forgetDataFile(folderId);
    }
    const files=await findChildren(folderId,DATA_FILE,'application/json');
    if(!files.length)return null;
    const ordered=[...files].sort((a,b)=>{const modified=new Date(b.modifiedTime||0)-new Date(a.modifiedTime||0);if(modified)return modified;return new Date(a.createdTime||0)-new Date(b.createdTime||0);});
    if(ordered.length>1)console.warn(`[GOOGLE_DRIVE] Existem ${ordered.length} arquivos principais chamados “${DATA_FILE}”. O mais recentemente modificado será reutilizado.`);
    return rememberDataFile(folderId,ordered[0]);
  }
  async function resolveDataFile(folderId){
    if(dataFilePromises.has(folderId))return await dataFilePromises.get(folderId);
    const promise=withCrossTabLock(`marco-drive-main-file-resolve:${folderId}`,()=>resolveDataFileUncached(folderId)).finally(()=>dataFilePromises.delete(folderId));
    dataFilePromises.set(folderId,promise);return await promise;
  }
  async function saveDataFile(folderId,state,{allowCreate=true,reason='save'}={}){
    return await withCrossTabLock(`marco-drive-main-file-save:${folderId}`,async()=>{
      let file=await resolveDataFileUncached(folderId);
      if(!file){for(const delay of [500,1200,2400]){await sleep(delay);file=await resolveDataFileUncached(folderId);if(file)break;}}
      let remoteState=null;
      if(file){
        remoteState=await readJson(file.id);
        /* Abrir outro dispositivo não pode fabricar uma revisão nova. Se os dados
           funcionais são idênticos, adotamos a confirmação oficial existente. */
        if(await contentChecksum(state)===await contentChecksum(remoteState))return {file:rememberDataFile(folderId,file),state:remoteState,unchanged:true};
        /* No modo 100% nuvem, uma gravação só é aceita depois que esta aba carregou
           a base oficial do Drive para a memória. Se essa referência não existe,
           a nuvem vence automaticamente — jamais tentamos publicar uma base inicial
           vazia criada pelo navegador. */
        const sessionBase=await window.MarcoStorage?.loadSyncBase?.();
        if(!sessionBase){
          return {file:rememberDataFile(folderId,file),state:remoteState,unchanged:true,recoveredFromUninitializedSession:true};
        }
        const sessionCompany=companyIdOf(sessionBase),remoteCompany=companyIdOf(remoteState);
        if(sessionCompany&&remoteCompany&&sessionCompany!==remoteCompany){
          const e=new Error('A pasta selecionada pertence a outra instalação. Nenhum dado foi enviado.');e.code='COMPANY_INSTANCE_CONFLICT';throw e;
        }
        const sessionCount=sourceCount(state),remoteCount=sourceCount(remoteState);
        if(remoteCount>0&&sessionCount===0&&!explicitLocalDeletionCoverage(state,remoteState)){
          const reasonText=String(reason||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
          const destructive=/exclu|cancel|remov|reset|rollback|restaur|apag/.test(reasonText);
          if(!destructive){
            return {file:rememberDataFile(folderId,file),state:remoteState,unchanged:true,recoveredFromEmptySession:true};
          }
        }
        assertSafeReplacement(state,remoteState);
      }
      else if(!allowCreate)throw new Error('A base oficial não foi localizada no Google Drive.');
      const prepared=await prepareOfficialState(state,remoteState);
      if(remoteState){const remoteHash=remoteState?.driveSync?.checksum||await stateChecksum(remoteState);if(remoteHash===prepared.driveSync.checksum)return {file:rememberDataFile(folderId,file),state:remoteState,unchanged:true};
        /* Histórico curto, limitado e verificável: autosave-1.json ... autosave-20.json. */
        const structure=cachedStructure();if(structure?.backups)await writeRotatingBackup(structure.backups,remoteState,{kind:'autosave',force:false});
      }
      if(!file)file=await createMetadata({name:DATA_FILE,mimeType:'application/json',parents:[folderId]});
      file=await updateJson(file.id,prepared);const confirmed=await readJson(file.id);const check=validateOfficialState(confirmed);if(!check.valid||confirmed?.driveSync?.checksum!==prepared.driveSync.checksum)throw new Error('A gravação oficial não foi confirmada pelo Google Drive.');
      return {file:rememberDataFile(folderId,file),state:confirmed,unchanged:false};
    });
  }

  async function applyConfirmedState(localState,confirmedState,startedSnapshot=null){
    if(!localState||!confirmedState)return localState;
    const confirmed=jsonClone(confirmedState),snapshot=startedSnapshot&&typeof startedSnapshot==='object'?jsonClone(startedSnapshot):jsonClone(localState);
    const confirmedRev=Math.max(0,Number(confirmed?.driveSync?.revision)||0),currentRev=Math.max(0,Number(localState?.driveSync?.revision)||0);
    if(confirmedRev<currentRev)return localState;
    const changedWhileSaving=!valueEqual(localState,snapshot);
    const next=changedWhileSaving?rebaseLocalChanges(snapshot,localState,confirmed):confirmed;
    Object.keys(localState).forEach(key=>delete localState[key]);
    Object.assign(localState,next);
    if(window.MarcoStorage?.save)await window.MarcoStorage.save(localState,{touch:false});
    /* A base confirmada é o ponto comum usado num conflito posterior. Ela fica
       separada do estado local, que pode já conter uma edição ainda não enviada. */
    if(window.MarcoStorage?.saveSyncBase)await window.MarcoStorage.saveSyncBase(confirmed);
    return localState;
  }

  // V2.4.0 — decisão pura (sem I/O) de qual base prevalece no login: só adota a
  // base do Drive quando ela é realmente mais nova (driveSync.revision maior).
  // Extraída à parte para poder ser testada sem precisar simular toda a API do
  // Google Drive — mesmo padrão já usado por applyConfirmedState/prepareOfficialState.
  function decideOfficialSource(localState,remoteState){
    const localCompany=companyIdOf(localState),remoteCompany=companyIdOf(remoteState);
    const foreignInstance=!!(localCompany&&remoteCompany&&localCompany!==remoteCompany);
    const localRev=Math.max(0,Number(localState?.driveSync?.revision)||0),remoteRev=Math.max(0,Number(remoteState?.driveSync?.revision)||0);
    const localCount=sourceCount(localState),remoteCount=sourceCount(remoteState);
    const explicitDeletionCoverage=explicitLocalDeletionCoverage(localState,remoteState);
    /* A base oficial nunca pode ficar inacessível só porque o navegador perdeu o
       cache local ou ficou com um número de revisão antigo/empatado. A única exceção
       é uma exclusão local explícita, já registrada por tombstone, cobrindo todos os
       registros que sumiram. */
    const localEmptyRemoteHasData=localCount===0&&remoteCount>0&&!explicitDeletionCoverage;
    const useRemote=foreignInstance||localEmptyRemoteHasData||remoteRev>localRev;
    return {useRemote,foreignInstance,localEmptyRemoteHasData,explicitDeletionCoverage,localRev,remoteRev,localCount,remoteCount};
  }

  let saveQueueRequested=0,saveQueueCompleted=0,saveQueueState=null,saveQueueOptions={},saveQueuePromise=null,saveQueueWaiters=[];
  function mergeSaveOptions(current,next){return {backup:!!(current?.backup||next?.backup),interactive:!!(current?.interactive||next?.interactive),reason:String(next?.reason||current?.reason||'alteracao')};}
  function settleSaveWaiters(target,error,result){const keep=[];for(const waiter of saveQueueWaiters){if(waiter.seq<=target){error?waiter.reject(error):waiter.resolve(result);}else keep.push(waiter);}saveQueueWaiters=keep;}
  async function runSaveQueue(){
    if(saveQueuePromise)return await saveQueuePromise;
    saveQueuePromise=(async()=>{
      let lastResult=null;
      while(saveQueueCompleted<saveQueueRequested){
        const target=saveQueueRequested,state=saveQueueState,options=saveQueueOptions;
        saveQueueOptions={};
        try{lastResult=await Drive.save(state,options);saveQueueCompleted=target;settleSaveWaiters(target,null,lastResult);}
        catch(error){saveQueueCompleted=target;settleSaveWaiters(target,error,null);throw error;}
      }
      return lastResult;
    })().finally(()=>{saveQueuePromise=null;if(saveQueueCompleted<saveQueueRequested)runSaveQueue().catch(()=>{});});
    return await saveQueuePromise;
  }
  function enqueueSave(state,options={}){
    if(!state)return Promise.reject(new Error('Estado indisponível para salvar.'));
    saveQueueState=state;saveQueueOptions=mergeSaveOptions(saveQueueOptions,options);const seq=++saveQueueRequested;
    const promise=new Promise((resolve,reject)=>saveQueueWaiters.push({seq,resolve,reject}));
    runSaveQueue().catch(()=>{});return promise;
  }
  function flushSaveQueue(){if(saveQueueCompleted>=saveQueueRequested)return Promise.resolve(null);return new Promise((resolve,reject)=>saveQueueWaiters.push({seq:saveQueueRequested,resolve,reject}));}

  const Drive={currentFile:null,
    cachedUser:()=>Auth.cached(),rootId,isConfigured:()=>!!(Auth.cached()&&rootId()),hasCredentials:()=>{const c=config();return !!(c.clientId&&c.apiKey&&c.projectNumber);},cachedStructure,
    async authenticate(interactive=true){return await authenticateGoogle(interactive);},
    async connect(interactive=true){if(connectionPromise)return await connectionPromise;connectionPromise=(async()=>{const user=await authenticateGoogle(interactive);let root=rootId();if(!root){const chosen=await picker();root=chosen.id;setRoot(root);}const structure=await ensureStructure(false);return {user,rootId:root,structure};})().finally(()=>{connectionPromise=null;});return await connectionPromise;},
    async ensureConnection(interactive=false){if(!this.isConfigured())return await this.connect(interactive);await Auth.ensure(interactive);const user=await assertAuthorizedUser(await Auth.fetchUser());return {user,rootId:rootId(),structure:await ensureStructure(false)};},
    async findDataFile(){const {structure}=await this.ensureConnection(false);this.currentFile=await resolveDataFile(structure.data);return this.currentFile;},
    async save(state,{backup=false,reason='manual',interactive=false}={}){
      const startedSnapshot=jsonClone(state),{structure,user,rootId:connectedRoot}=await this.ensureConnection(interactive);let result;
      try{result=await saveDataFile(structure.data,startedSnapshot,{reason});}
      catch(error){
        if(error?.code!=='REMOTE_NEWER')throw error;
        /* Outro dispositivo publicou primeiro. Em vez de travar numa repetição
           infinita, reaplicamos apenas as mudanças locais sobre a base remota. */
        const file=this.currentFile||await resolveDataFile(structure.data);if(!file)throw error;
        const remoteState=await readJson(file.id),baseState=await window.MarcoStorage?.loadSyncBase?.();
        if(!baseState){const e=new Error('O Google Drive foi alterado em outro dispositivo, mas a referência desta sessão não está disponível. Reabra o aplicativo para carregar novamente a base oficial.');e.code='SYNC_BASE_MISSING';throw e;}
        const rebased=rebaseLocalChanges(baseState,startedSnapshot,remoteState);
        result=await saveDataFile(structure.data,rebased,{reason:`reconciliado-${reason}`});
      }
      this.currentFile=result.file;await applyConfirmedState(state,result.state,startedSnapshot);localStorage.setItem(LAST_SAVE,new Date().toISOString());await writeInstallationManifest(connectedRoot,structure,result.state,user);if(backup){await writeRotatingBackup(structure.backups,result.state,{kind:'forcesave',force:true});const name=`Marco_Iris_${String(reason).replace(/[^a-zA-Z0-9_-]/g,'-')}_${stamp()}.json`;const bf=await createMetadata({name,mimeType:'application/json',parents:[structure.backups]});await updateJson(bf.id,result.state);}if(SecureVault.needsMigration()&&!result.unchanged){SecureVault.markMigrated();scheduleBackupEncryptionMigration(structure.backups);}return result.file;
    },
    async load({interactive=false,rememberBase=true}={}){
      const connection=await this.ensureConnection(interactive);
      const f=this.currentFile||await this.findDataFile();
      if(!f)throw new Error('Ainda não existe um arquivo de dados nesta pasta.');
      let [state,info]=await Promise.all([readJson(f.id),meta(f.id)]);
      let check=validateOfficialState(state);
      if(!check.valid)throw new Error('A base oficial do Google Drive é inválida: '+check.errors.join(' '));
      ensureCompanyId(state);
      if(SecureVault.needsMigration()){
        // A ativação inicial precisa terminar no arquivo oficial antes de
        // liberar o sistema. Em segundo plano, uma recarga podia interromper
        // o processo e fazer o app pedir para criar outra senha mestra.
        const latest=await meta(f.id);
        if(info.modifiedTime&&latest.modifiedTime&&info.modifiedTime!==latest.modifiedTime)throw new Error('A base foi atualizada durante a ativação da criptografia. Reabra o aplicativo para carregar a versão mais recente.');
        const updated=await updateJson(f.id,state);
        const confirmed=await readJson(f.id);
        const encryptedCheck=validateOfficialState(confirmed);
        if(!encryptedCheck.valid)throw new Error('A conversão criptografada da base principal não foi confirmada.');
        SecureVault.markMigrated();
        state=confirmed;
        info=updated;
        scheduleBackupEncryptionMigration(connection.structure.backups,15000);
      }else scheduleBackupEncryptionMigration(connection.structure.backups);
      this.currentFile=info;
      if(rememberBase&&window.MarcoStorage?.saveSyncBase)await window.MarcoStorage.saveSyncBase(state);
      return {state,meta:info};
    },
    async initializeOfficialState(initialState,{interactive=true,onProgress=()=>{}}={}){
      if(!navigator.onLine)throw new Error('Internet obrigatória para abrir o Marco Iris.');
      onProgress('Conectando ao Google Drive');
      const conn=await this.ensureConnection(interactive);
      onProgress('Localizando a base oficial');
      const file=this.currentFile||await this.findDataFile();
      if(!file){
        onProgress('Criando a primeira base oficial');
        const cleanState=jsonClone(initialState||window.MARCO_INITIAL_DATA);
        ensureCompanyId(cleanState);
        const result=await saveDataFile(conn.structure.data,cleanState,{reason:'primeira-base-oficial-cloud-only'});
        this.currentFile=result.file;
        if(window.MarcoStorage?.saveSyncBase)await window.MarcoStorage.saveSyncBase(result.state);
        return {state:result.state,created:true,source:'drive-created',user:conn.user};
      }
      onProgress('Carregando dados oficiais da nuvem');
      const remote=await this.load({rememberBase:false});
      ensureCompanyId(remote.state);
      if(window.MarcoStorage?.saveSyncBase)await window.MarcoStorage.saveSyncBase(remote.state);
      onProgress('Base oficial confirmada');
      return {state:remote.state,created:false,source:'drive',user:conn.user,discardedLocalInstance:true};
    },
    async sync(state,{interactive=false,backup=false,reason='sincronizacao'}={}){await this.ensureConnection(interactive);const f=this.currentFile||await this.findDataFile();if(!f){await this.save(state,{backup:true,reason:'primeira-sincronizacao'});return {direction:'local',created:true};}const previousSyncBase=await window.MarcoStorage?.loadSyncBase?.(),remote=await this.load({rememberBase:false});const localRev=Math.max(0,Number(state?.driveSync?.revision)||0),remoteRev=Math.max(0,Number(remote.state?.driveSync?.revision)||0);if(remoteRev>localRev){const localChanged=!!previousSyncBase&&await contentChecksum(state)!==await contentChecksum(previousSyncBase);if(localChanged){await this.save(state,{backup,reason:`reconciliado-${reason}`});return {direction:'merged',state,meta:this.currentFile};}if(window.MarcoStorage?.saveSyncBase)await window.MarcoStorage.saveSyncBase(remote.state);return {direction:'remote',state:remote.state,meta:remote.meta};}await this.save(state,{backup,reason});return {direction:'local',meta:this.currentFile};},
    /* v2.5.0 — consulta passiva entre dispositivos. Lê a base oficial e só a aplica
       quando a revisão do Drive é maior; não salva, não incrementa revisão e não
       publica o bridge. Isso impede o computador ocioso de sobrescrever o celular. */
    async pullIfNewer(state,{interactive=false}={}){
      if(!state)throw new Error('Sessão atual indisponível para atualização.');
      await this.ensureConnection(interactive);
      const file=this.currentFile||await this.findDataFile();
      if(!file)throw new Error('Ainda não existe um arquivo de dados nesta pasta.');
      /* Consulta primeiro apenas os metadados. Na maioria das rodadas isso evita
         baixar o current.json inteiro e deixa o aplicativo leve mesmo aberto o dia todo. */
      const latestMeta=await meta(file.id),knownModified=String(this.currentFile?.modifiedTime||file.modifiedTime||''),latestModified=String(latestMeta.modifiedTime||'');
      if(knownModified&&latestModified&&knownModified===latestModified){this.currentFile=latestMeta;return {updated:false,unchanged:true,meta:latestMeta};}
      const remoteState=await readJson(file.id),check=validateOfficialState(remoteState);
      if(!check.valid)throw new Error('A base oficial do Google Drive é inválida: '+check.errors.join(' '));
      ensureCompanyId(remoteState);this.currentFile=latestMeta;
      const localCompany=companyIdOf(state),remoteCompany=companyIdOf(remoteState);
      if(localCompany&&remoteCompany&&localCompany!==remoteCompany){const error=new Error('A base remota pertence a outra instalação. A atualização automática foi bloqueada.');error.code='COMPANY_INSTANCE_CONFLICT';throw error;}
      const localRev=Math.max(0,Number(state?.driveSync?.revision)||0),remoteRev=Math.max(0,Number(remoteState?.driveSync?.revision)||0);
      if(remoteRev<=localRev)return {updated:false,localRev,remoteRev,meta:latestMeta};
      const startedSnapshot=jsonClone(state);
      await applyConfirmedState(state,remoteState,startedSnapshot);
      return {updated:true,localRev,remoteRev,meta:latestMeta,state};
    },
    async uploadBlob(blob,folderKey,fileName,existingId='',expectedSha256=''){
      const {structure}=await this.ensureConnection(false),parent=structure[folderKey];
      if(!parent)throw new Error('Pasta de nuvem inválida.');
      let f=existingId?await meta(existingId).catch(()=>null):await findChild(parent,fileName),created=false;
      if(f&&!existingId&&expectedSha256){
        const existingBlob=await downloadBlob(f.id),digest=await crypto.subtle.digest('SHA-256',await existingBlob.arrayBuffer());
        const existingHash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
        if(existingHash===expectedSha256)return {...f,created:false,reused:true,sha256:existingHash};
        const error=new Error(`Já existe no Google Drive um arquivo diferente chamado “${fileName}”. A migração foi bloqueada para não sobrescrevê-lo.`);error.code='MEDIA_NAME_CONFLICT';throw error;
      }
      if(!f){f=await createMetadata({name:fileName,mimeType:blob.type||'application/octet-stream',parents:[parent]});created=true;}
      const uploaded=await uploadMediaContent(f.id,blob);return {...uploaded,created,reused:false};
    },
    async restoreOfficialSnapshot(snapshot,{reason='rollback'}={}){
      const clean=jsonClone(snapshot||{}),check=validateOfficialState(clean);if(!check.valid)throw new Error('O snapshot de rollback é inválido: '+check.errors.join(' '));
      const {structure}=await this.ensureConnection(false),file=this.currentFile||await resolveDataFile(structure.data);if(!file)throw new Error('A base oficial não foi localizada para rollback.');
      const remote=await readJson(file.id),remoteCheck=validateOfficialState(remote);if(!remoteCheck.valid)throw new Error('A base remota atual é inválida: '+remoteCheck.errors.join(' '));
      const localCompany=companyIdOf(clean),remoteCompany=companyIdOf(remote);if(localCompany&&remoteCompany&&localCompany!==remoteCompany){const error=new Error('O rollback pertence a outra instalação e foi bloqueado.');error.code='COMPANY_INSTANCE_CONFLICT';throw error;}
      await writeRotatingBackup(structure.backups,remote,{kind:'forcesave',force:true});
      const backupName=`Marco_Iris_antes_${String(reason||'rollback').replace(/[^a-zA-Z0-9_-]/g,'-')}_${stamp()}.json`,backupFile=await createMetadata({name:backupName,mimeType:'application/json',parents:[structure.backups]});await updateJson(backupFile.id,remote);
      const prepared=await prepareOfficialState(clean,remote);prepared.driveSync.rollbackReason=String(reason||'rollback');prepared.driveSync.rollbackAt=new Date().toISOString();
      const updated=await updateJson(file.id,prepared),confirmed=await readJson(file.id),confirmedCheck=validateOfficialState(confirmed);
      if(!confirmedCheck.valid||confirmed?.driveSync?.checksum!==prepared.driveSync.checksum)throw new Error('O rollback não foi confirmado pelo Google Drive.');
      this.currentFile=updated;if(window.MarcoStorage?.saveSyncBase)await window.MarcoStorage.saveSyncBase(confirmed);return {file:updated,state:confirmed,backupFile};
    },
    downloadBlob,meta,trash,
    async folderStatus(){const {structure}=await this.ensureConnection(false);return Object.entries(FOLDERS).map(([key,name])=>({key,name,id:structure[key],url:`https://drive.google.com/drive/folders/${structure[key]}`}));},
    /* BORION INTEROP v1.0.0 — protected transport seam. */
    async integrationFolderId(){const {structure}=await this.ensureConnection(false);return structure.integration;},
    async writeIntegrationJson(name,obj){const folderId=await this.integrationFolderId();const f=await resolveIntegrationFile(folderId,name,true,obj);const result=await updateJson(f.id,await IntegrationVault.protect(obj));await IntegrationVault.confirmSetupPersisted?.(IntegrationVault.status?.().vaultId||'');if(IntegrationVault.needsMigration())IntegrationVault.markMigrated();return result;},
    async readIntegrationJson(name){const folderId=await this.integrationFolderId();const f=await resolveIntegrationFile(folderId,name,false,null);if(!f)return null;const r=await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`,{headers:await headers()});if(!r.ok)throw new Error('Falha ao carregar a integração do Google Drive.');const value=await IntegrationVault.open(await r.json());if(IntegrationVault.needsMigration()){await updateJson(f.id,await IntegrationVault.protect(value));await IntegrationVault.confirmSetupPersisted?.(IntegrationVault.status?.().vaultId||'');IntegrationVault.markMigrated();}return value;},
    async writeBackupJson(name,obj){const {structure}=await this.ensureConnection(false);const safeName=String(name||`backup-${stamp()}.json`).replace(/[\\/:*?"<>|]/g,'-');const f=await createMetadata({name:safeName,mimeType:'application/json',parents:[structure.backups]});await updateJson(f.id,obj);const confirmed=await readJson(f.id);return {file:f,state:confirmed};},
    enqueueSave,flushSaveQueue,
    async writeAutosave(state,{force=false}={}){const {structure}=await this.ensureConnection(false);return await writeRotatingBackup(structure.backups,state,{kind:'autosave',force});},
    async writeForceSave(state){const {structure}=await this.ensureConnection(false);return await writeRotatingBackup(structure.backups,state,{kind:'forcesave',force:true});},
    async diagnose(state){const conn=await this.ensureConnection(false),main=await this.findDataFile(),bridge=await this.readIntegrationJson('marco-iris.bridge.json');return {ok:!!(main&&bridge),user:conn.user,rootId:conn.rootId,folders:await this.folderStatus(),mainFile:main||null,bridgeFile:bridge?{revision:Number(bridge.revision)||0,recordCount:Number(bridge.recordCount)||0,generatedAt:bridge.generatedAt||'',companyInstanceId:bridge.companyInstanceId||bridge.instanceId||''}:null,companyInstanceId:companyIdOf(state),lastSave:localStorage.getItem(LAST_SAVE)||''};},
    disconnect(){const u=Auth.cached(),root=rootId();if(u)localStorage.removeItem(rootKey(u.sub));if(root)localStorage.removeItem(structKey(root));for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i)||'';if(key.startsWith('marco_iris_v240_'))localStorage.removeItem(key);}window.MarcoStorage?.clearSyncBase?.().catch?.(()=>{});this.currentFile=null;structurePromise=null;connectionPromise=null;integrationFileIds.clear();integrationFilePromises.clear();dataFilePromises.clear();if(primaryEncryptionTimer)clearTimeout(primaryEncryptionTimer);if(backupEncryptionTimer)clearTimeout(backupEncryptionTimer);primaryEncryptionTimer=backupEncryptionTimer=null;encryptionMigrationInFlight=false;saveQueueRequested=saveQueueCompleted=0;saveQueueState=null;saveQueueOptions={};saveQueueWaiters=[];Auth.signOut();},
    __test:{applyConfirmedState,prepareOfficialState,assertSafeReplacement,validateOfficialState,decideOfficialSource,explicitLocalDeletionCoverage,contentChecksum,rebaseLocalChanges,mergeArrayDelta,writeRotatingBackup,enqueueSave,flushSaveQueue}
  };
  window.GoogleDriveMarco=Drive;
})();

/* ===== js/vendor/qrcode-local.js ===== */
/*
 * Marco Iris Local QR Code
 * QR encoder derived from qrcode-terminal's vendored QRCode implementation.
 * Original QRCode for JavaScript © 2009 Kazuhiko Arase, MIT License.
 * Runs entirely in the browser; no network requests or external APIs.
 */
(function(global){
'use strict';
const modules={
'./QRMode': function(module,exports,require){
module.exports = {
    MODE_NUMBER :       1 << 0,
    MODE_ALPHA_NUM :    1 << 1,
    MODE_8BIT_BYTE :    1 << 2,
    MODE_KANJI :        1 << 3
};

},
'./QR8bitByte': function(module,exports,require){
var QRMode = require('./QRMode');

function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = data;
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			// not JIS ...
			buffer.put(this.data.charCodeAt(i), 8);
		}
	}
};

module.exports = QR8bitByte;

},
'./QRBitBuffer': function(module,exports,require){
function QRBitBuffer() {
	this.buffer = [];
	this.length = 0;
}

QRBitBuffer.prototype = {

	get : function(index) {
		var bufIndex = Math.floor(index / 8);
		return ( (this.buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
	},
	
	put : function(num, length) {
		for (var i = 0; i < length; i++) {
			this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
		}
	},
	
	getLengthInBits : function() {
		return this.length;
	},
	
	putBit : function(bit) {
	
		var bufIndex = Math.floor(this.length / 8);
		if (this.buffer.length <= bufIndex) {
			this.buffer.push(0);
		}
	
		if (bit) {
			this.buffer[bufIndex] |= (0x80 >>> (this.length % 8) );
		}
	
		this.length++;
	}
};

module.exports = QRBitBuffer;

},
'./QRErrorCorrectLevel': function(module,exports,require){
module.exports = {
	L : 1,
	M : 0,
	Q : 3,
	H : 2
};


},
'./QRMaskPattern': function(module,exports,require){
module.exports = {
	PATTERN000 : 0,
	PATTERN001 : 1,
	PATTERN010 : 2,
	PATTERN011 : 3,
	PATTERN100 : 4,
	PATTERN101 : 5,
	PATTERN110 : 6,
	PATTERN111 : 7
};

},
'./QRMath': function(module,exports,require){
var QRMath = {

	glog : function(n) {
	
		if (n < 1) {
			throw new Error("glog(" + n + ")");
		}
		
		return QRMath.LOG_TABLE[n];
	},
	
	gexp : function(n) {
	
		while (n < 0) {
			n += 255;
		}
	
		while (n >= 256) {
			n -= 255;
		}
	
		return QRMath.EXP_TABLE[n];
	},
	
	EXP_TABLE : new Array(256),
	
	LOG_TABLE : new Array(256)

};
	
for (var i = 0; i < 8; i++) {
	QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
	QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4]
		^ QRMath.EXP_TABLE[i - 5]
		^ QRMath.EXP_TABLE[i - 6]
		^ QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
	QRMath.LOG_TABLE[QRMath.EXP_TABLE[i] ] = i;
}

module.exports = QRMath;

},
'./QRPolynomial': function(module,exports,require){
var QRMath = require('./QRMath');

function QRPolynomial(num, shift) {
	if (num.length === undefined) {
		throw new Error(num.length + "/" + shift);
	}

	var offset = 0;

	while (offset < num.length && num[offset] === 0) {
		offset++;
	}

	this.num = new Array(num.length - offset + shift);
	for (var i = 0; i < num.length - offset; i++) {
		this.num[i] = num[i + offset];
	}
}

QRPolynomial.prototype = {

	get : function(index) {
		return this.num[index];
	},
	
	getLength : function() {
		return this.num.length;
	},
	
	multiply : function(e) {
	
		var num = new Array(this.getLength() + e.getLength() - 1);
	
		for (var i = 0; i < this.getLength(); i++) {
			for (var j = 0; j < e.getLength(); j++) {
				num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i) ) + QRMath.glog(e.get(j) ) );
			}
		}
	
		return new QRPolynomial(num, 0);
	},
	
	mod : function(e) {
	
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}
	
		var ratio = QRMath.glog(this.get(0) ) - QRMath.glog(e.get(0) );
	
		var num = new Array(this.getLength() );
		
		for (var i = 0; i < this.getLength(); i++) {
			num[i] = this.get(i);
		}
		
		for (var x = 0; x < e.getLength(); x++) {
			num[x] ^= QRMath.gexp(QRMath.glog(e.get(x) ) + ratio);
		}
	
		// recursive call
		return new QRPolynomial(num, 0).mod(e);
	}
};

module.exports = QRPolynomial;

},
'./QRRSBlock': function(module,exports,require){
var QRErrorCorrectLevel = require('./QRErrorCorrectLevel');

function QRRSBlock(totalCount, dataCount) {
	this.totalCount = totalCount;
	this.dataCount  = dataCount;
}

QRRSBlock.RS_BLOCK_TABLE = [

	// L
	// M
	// Q
	// H

	// 1
	[1, 26, 19],
	[1, 26, 16],
	[1, 26, 13],
	[1, 26, 9],
	
	// 2
	[1, 44, 34],
	[1, 44, 28],
	[1, 44, 22],
	[1, 44, 16],

	// 3
	[1, 70, 55],
	[1, 70, 44],
	[2, 35, 17],
	[2, 35, 13],

	// 4		
	[1, 100, 80],
	[2, 50, 32],
	[2, 50, 24],
	[4, 25, 9],
	
	// 5
	[1, 134, 108],
	[2, 67, 43],
	[2, 33, 15, 2, 34, 16],
	[2, 33, 11, 2, 34, 12],
	
	// 6
	[2, 86, 68],
	[4, 43, 27],
	[4, 43, 19],
	[4, 43, 15],
	
	// 7		
	[2, 98, 78],
	[4, 49, 31],
	[2, 32, 14, 4, 33, 15],
	[4, 39, 13, 1, 40, 14],
	
	// 8
	[2, 121, 97],
	[2, 60, 38, 2, 61, 39],
	[4, 40, 18, 2, 41, 19],
	[4, 40, 14, 2, 41, 15],
	
	// 9
	[2, 146, 116],
	[3, 58, 36, 2, 59, 37],
	[4, 36, 16, 4, 37, 17],
	[4, 36, 12, 4, 37, 13],
	
	// 10		
	[2, 86, 68, 2, 87, 69],
	[4, 69, 43, 1, 70, 44],
	[6, 43, 19, 2, 44, 20],
	[6, 43, 15, 2, 44, 16],

	// 11
	[4, 101, 81],
	[1, 80, 50, 4, 81, 51],
	[4, 50, 22, 4, 51, 23],
	[3, 36, 12, 8, 37, 13],

	// 12
	[2, 116, 92, 2, 117, 93],
	[6, 58, 36, 2, 59, 37],
	[4, 46, 20, 6, 47, 21],
	[7, 42, 14, 4, 43, 15],

	// 13
	[4, 133, 107],
	[8, 59, 37, 1, 60, 38],
	[8, 44, 20, 4, 45, 21],
	[12, 33, 11, 4, 34, 12],

	// 14
	[3, 145, 115, 1, 146, 116],
	[4, 64, 40, 5, 65, 41],
	[11, 36, 16, 5, 37, 17],
	[11, 36, 12, 5, 37, 13],

	// 15
	[5, 109, 87, 1, 110, 88],
	[5, 65, 41, 5, 66, 42],
	[5, 54, 24, 7, 55, 25],
	[11, 36, 12],

	// 16
	[5, 122, 98, 1, 123, 99],
	[7, 73, 45, 3, 74, 46],
	[15, 43, 19, 2, 44, 20],
	[3, 45, 15, 13, 46, 16],

	// 17
	[1, 135, 107, 5, 136, 108],
	[10, 74, 46, 1, 75, 47],
	[1, 50, 22, 15, 51, 23],
	[2, 42, 14, 17, 43, 15],

	// 18
	[5, 150, 120, 1, 151, 121],
	[9, 69, 43, 4, 70, 44],
	[17, 50, 22, 1, 51, 23],
	[2, 42, 14, 19, 43, 15],

	// 19
	[3, 141, 113, 4, 142, 114],
	[3, 70, 44, 11, 71, 45],
	[17, 47, 21, 4, 48, 22],
	[9, 39, 13, 16, 40, 14],

	// 20
	[3, 135, 107, 5, 136, 108],
	[3, 67, 41, 13, 68, 42],
	[15, 54, 24, 5, 55, 25],
	[15, 43, 15, 10, 44, 16],

	// 21
	[4, 144, 116, 4, 145, 117],
	[17, 68, 42],
	[17, 50, 22, 6, 51, 23],
	[19, 46, 16, 6, 47, 17],

	// 22
	[2, 139, 111, 7, 140, 112],
	[17, 74, 46],
	[7, 54, 24, 16, 55, 25],
	[34, 37, 13],

	// 23
	[4, 151, 121, 5, 152, 122],
	[4, 75, 47, 14, 76, 48],
	[11, 54, 24, 14, 55, 25],
	[16, 45, 15, 14, 46, 16],

	// 24
	[6, 147, 117, 4, 148, 118],
	[6, 73, 45, 14, 74, 46],
	[11, 54, 24, 16, 55, 25],
	[30, 46, 16, 2, 47, 17],

	// 25
	[8, 132, 106, 4, 133, 107],
	[8, 75, 47, 13, 76, 48],
	[7, 54, 24, 22, 55, 25],
	[22, 45, 15, 13, 46, 16],

	// 26
	[10, 142, 114, 2, 143, 115],
	[19, 74, 46, 4, 75, 47],
	[28, 50, 22, 6, 51, 23],
	[33, 46, 16, 4, 47, 17],

	// 27
	[8, 152, 122, 4, 153, 123],
	[22, 73, 45, 3, 74, 46],
	[8, 53, 23, 26, 54, 24],
	[12, 45, 15, 28, 46, 16],

	// 28
	[3, 147, 117, 10, 148, 118],
	[3, 73, 45, 23, 74, 46],
	[4, 54, 24, 31, 55, 25],
	[11, 45, 15, 31, 46, 16],

	// 29
	[7, 146, 116, 7, 147, 117],
	[21, 73, 45, 7, 74, 46],
	[1, 53, 23, 37, 54, 24],
	[19, 45, 15, 26, 46, 16],

	// 30
	[5, 145, 115, 10, 146, 116],
	[19, 75, 47, 10, 76, 48],
	[15, 54, 24, 25, 55, 25],
	[23, 45, 15, 25, 46, 16],

	// 31
	[13, 145, 115, 3, 146, 116],
	[2, 74, 46, 29, 75, 47],
	[42, 54, 24, 1, 55, 25],
	[23, 45, 15, 28, 46, 16],

	// 32
	[17, 145, 115],
	[10, 74, 46, 23, 75, 47],
	[10, 54, 24, 35, 55, 25],
	[19, 45, 15, 35, 46, 16],

	// 33
	[17, 145, 115, 1, 146, 116],
	[14, 74, 46, 21, 75, 47],
	[29, 54, 24, 19, 55, 25],
	[11, 45, 15, 46, 46, 16],

	// 34
	[13, 145, 115, 6, 146, 116],
	[14, 74, 46, 23, 75, 47],
	[44, 54, 24, 7, 55, 25],
	[59, 46, 16, 1, 47, 17],

	// 35
	[12, 151, 121, 7, 152, 122],
	[12, 75, 47, 26, 76, 48],
	[39, 54, 24, 14, 55, 25],
	[22, 45, 15, 41, 46, 16],

	// 36
	[6, 151, 121, 14, 152, 122],
	[6, 75, 47, 34, 76, 48],
	[46, 54, 24, 10, 55, 25],
	[2, 45, 15, 64, 46, 16],

	// 37
	[17, 152, 122, 4, 153, 123],
	[29, 74, 46, 14, 75, 47],
	[49, 54, 24, 10, 55, 25],
	[24, 45, 15, 46, 46, 16],

	// 38
	[4, 152, 122, 18, 153, 123],
	[13, 74, 46, 32, 75, 47],
	[48, 54, 24, 14, 55, 25],
	[42, 45, 15, 32, 46, 16],

	// 39
	[20, 147, 117, 4, 148, 118],
	[40, 75, 47, 7, 76, 48],
	[43, 54, 24, 22, 55, 25],
	[10, 45, 15, 67, 46, 16],

	// 40
	[19, 148, 118, 6, 149, 119],
	[18, 75, 47, 31, 76, 48],
	[34, 54, 24, 34, 55, 25],
	[20, 45, 15, 61, 46, 16]
];

QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
	
	var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
	
	if (rsBlock === undefined) {
		throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
	}

	var length = rsBlock.length / 3;
	
	var list = [];
	
	for (var i = 0; i < length; i++) {

		var count = rsBlock[i * 3 + 0];
		var totalCount = rsBlock[i * 3 + 1];
		var dataCount  = rsBlock[i * 3 + 2];

		for (var j = 0; j < count; j++) {
			list.push(new QRRSBlock(totalCount, dataCount) );	
		}
	}
	
	return list;
};

QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {

	switch(errorCorrectLevel) {
	case QRErrorCorrectLevel.L :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
	case QRErrorCorrectLevel.M :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
	case QRErrorCorrectLevel.Q :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
	case QRErrorCorrectLevel.H :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
	default :
		return undefined;
	}
};

module.exports = QRRSBlock;

},
'./QRUtil': function(module,exports,require){
var QRMode = require('./QRMode');
var QRPolynomial = require('./QRPolynomial');
var QRMath = require('./QRMath');
var QRMaskPattern = require('./QRMaskPattern');

var QRUtil = {

    PATTERN_POSITION_TABLE : [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],        
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ],

    G15 : (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18 : (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK : (1 << 14) | (1 << 12) | (1 << 10)    | (1 << 4) | (1 << 1),

    getBCHTypeInfo : function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) ) );    
        }
        return ( (data << 10) | d) ^ QRUtil.G15_MASK;
    },

    getBCHTypeNumber : function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) ) );    
        }
        return (data << 12) | d;
    },

    getBCHDigit : function(data) {

        var digit = 0;

        while (data !== 0) {
            digit++;
            data >>>= 1;
        }

        return digit;
    },

    getPatternPosition : function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },

    getMask : function(maskPattern, i, j) {
        
        switch (maskPattern) {
            
        case QRMaskPattern.PATTERN000 : return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001 : return i % 2 === 0;
        case QRMaskPattern.PATTERN010 : return j % 3 === 0;
        case QRMaskPattern.PATTERN011 : return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 === 0;
        case QRMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 === 0;

        default :
            throw new Error("bad maskPattern:" + maskPattern);
        }
    },

    getErrorCorrectPolynomial : function(errorCorrectLength) {

        var a = new QRPolynomial([1], 0);

        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0) );
        }

        return a;
    },

    getLengthInBits : function(mode, type) {

        if (1 <= type && type < 10) {

            // 1 - 9

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 10;
            case QRMode.MODE_ALPHA_NUM  : return 9;
            case QRMode.MODE_8BIT_BYTE  : return 8;
            case QRMode.MODE_KANJI      : return 8;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 27) {

            // 10 - 26

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 12;
            case QRMode.MODE_ALPHA_NUM  : return 11;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 10;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 41) {

            // 27 - 40

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 14;
            case QRMode.MODE_ALPHA_NUM  : return 13;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 12;
            default :
                throw new Error("mode:" + mode);
            }

        } else {
            throw new Error("type:" + type);
        }
    },

    getLostPoint : function(qrCode) {
        
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0; 
        var col = 0;

        
        // LEVEL1
        
        for (row = 0; row < moduleCount; row++) {

            for (col = 0; col < moduleCount; col++) {

                var sameCount = 0;
                var dark = qrCode.isDark(row, col);

                for (var r = -1; r <= 1; r++) {

                    if (row + r < 0 || moduleCount <= row + r) {
                        continue;
                    }

                    for (var c = -1; c <= 1; c++) {

                        if (col + c < 0 || moduleCount <= col + c) {
                            continue;
                        }

                        if (r === 0 && c === 0) {
                            continue;
                        }

                        if (dark === qrCode.isDark(row + r, col + c) ) {
                            sameCount++;
                        }
                    }
                }

                if (sameCount > 5) {
                    lostPoint += (3 + sameCount - 5);
                }
            }
        }

        // LEVEL2

        for (row = 0; row < moduleCount - 1; row++) {
            for (col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row,     col    ) ) count++;
                if (qrCode.isDark(row + 1, col    ) ) count++;
                if (qrCode.isDark(row,     col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count === 0 || count === 4) {
                    lostPoint += 3;
                }
            }
        }

        // LEVEL3

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && 
                        !qrCode.isDark(row, col + 1) && 
                         qrCode.isDark(row, col + 2) && 
                         qrCode.isDark(row, col + 3) && 
                         qrCode.isDark(row, col + 4) && 
                        !qrCode.isDark(row, col + 5) && 
                         qrCode.isDark(row, col + 6) ) {
                    lostPoint += 40;
                }
            }
        }

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) &&
                        !qrCode.isDark(row + 1, col) &&
                         qrCode.isDark(row + 2, col) &&
                         qrCode.isDark(row + 3, col) &&
                         qrCode.isDark(row + 4, col) &&
                        !qrCode.isDark(row + 5, col) &&
                         qrCode.isDark(row + 6, col) ) {
                    lostPoint += 40;
                }
            }
        }

        // LEVEL4
        
        var darkCount = 0;

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) {
                    darkCount++;
                }
            }
        }
        
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;

        return lostPoint;       
    }

};

module.exports = QRUtil;

},
'./index': function(module,exports,require){
//---------------------------------------------------------------------
// QRCode for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//   http://www.opensource.org/licenses/mit-license.php
//
// The word "QR Code" is registered trademark of 
// DENSO WAVE INCORPORATED
//   http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------
// Modified to work in node for this project (and some refactoring)
//---------------------------------------------------------------------

var QR8bitByte = require('./QR8bitByte');
var QRUtil = require('./QRUtil');
var QRPolynomial = require('./QRPolynomial');
var QRRSBlock = require('./QRRSBlock');
var QRBitBuffer = require('./QRBitBuffer');

function QRCode(typeNumber, errorCorrectLevel) {
	this.typeNumber = typeNumber;
	this.errorCorrectLevel = errorCorrectLevel;
	this.modules = null;
	this.moduleCount = 0;
	this.dataCache = null;
	this.dataList = [];
}

QRCode.prototype = {
	
	addData : function(data) {
		var newData = new QR8bitByte(data);
		this.dataList.push(newData);
		this.dataCache = null;
	},
	
	isDark : function(row, col) {
		if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
			throw new Error(row + "," + col);
		}
		return this.modules[row][col];
	},

	getModuleCount : function() {
		return this.moduleCount;
	},
	
	make : function() {
		// Calculate automatically typeNumber if provided is < 1
		if (this.typeNumber < 1 ){
			var typeNumber = 1;
			for (typeNumber = 1; typeNumber < 40; typeNumber++) {
				var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);

				var buffer = new QRBitBuffer();
				var totalDataCount = 0;
				for (var i = 0; i < rsBlocks.length; i++) {
					totalDataCount += rsBlocks[i].dataCount;
				}

				for (var x = 0; x < this.dataList.length; x++) {
					var data = this.dataList[x];
					buffer.put(data.mode, 4);
					buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
					data.write(buffer);
				}
				if (buffer.getLengthInBits() <= totalDataCount * 8)
					break;
			}
			this.typeNumber = typeNumber;
		}
		this.makeImpl(false, this.getBestMaskPattern() );
	},
	
	makeImpl : function(test, maskPattern) {
		
		this.moduleCount = this.typeNumber * 4 + 17;
		this.modules = new Array(this.moduleCount);
		
		for (var row = 0; row < this.moduleCount; row++) {
			
			this.modules[row] = new Array(this.moduleCount);
			
			for (var col = 0; col < this.moduleCount; col++) {
				this.modules[row][col] = null;//(col + row) % 3;
			}
		}
	
		this.setupPositionProbePattern(0, 0);
		this.setupPositionProbePattern(this.moduleCount - 7, 0);
		this.setupPositionProbePattern(0, this.moduleCount - 7);
		this.setupPositionAdjustPattern();
		this.setupTimingPattern();
		this.setupTypeInfo(test, maskPattern);
		
		if (this.typeNumber >= 7) {
			this.setupTypeNumber(test);
		}
	
		if (this.dataCache === null) {
			this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
		}
	
		this.mapData(this.dataCache, maskPattern);
	},

	setupPositionProbePattern : function(row, col)  {
		
		for (var r = -1; r <= 7; r++) {
			
			if (row + r <= -1 || this.moduleCount <= row + r) continue;
			
			for (var c = -1; c <= 7; c++) {
				
				if (col + c <= -1 || this.moduleCount <= col + c) continue;
				
				if ( (0 <= r && r <= 6 && (c === 0 || c === 6) ) || 
                     (0 <= c && c <= 6 && (r === 0 || r === 6) ) || 
                     (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
					this.modules[row + r][col + c] = true;
				} else {
					this.modules[row + r][col + c] = false;
				}
			}		
		}		
	},
	
	getBestMaskPattern : function() {
	
		var minLostPoint = 0;
		var pattern = 0;
	
		for (var i = 0; i < 8; i++) {
			
			this.makeImpl(true, i);
	
			var lostPoint = QRUtil.getLostPoint(this);
	
			if (i === 0 || minLostPoint >  lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}
	
		return pattern;
	},
	
	createMovieClip : function(target_mc, instance_name, depth) {
	
		var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
		var cs = 1;
	
		this.make();

		for (var row = 0; row < this.modules.length; row++) {
			
			var y = row * cs;
			
			for (var col = 0; col < this.modules[row].length; col++) {
	
				var x = col * cs;
				var dark = this.modules[row][col];
			
				if (dark) {
					qr_mc.beginFill(0, 100);
					qr_mc.moveTo(x, y);
					qr_mc.lineTo(x + cs, y);
					qr_mc.lineTo(x + cs, y + cs);
					qr_mc.lineTo(x, y + cs);
					qr_mc.endFill();
				}
			}
		}
		
		return qr_mc;
	},

	setupTimingPattern : function() {
		
		for (var r = 8; r < this.moduleCount - 8; r++) {
			if (this.modules[r][6] !== null) {
				continue;
			}
			this.modules[r][6] = (r % 2 === 0);
		}
	
		for (var c = 8; c < this.moduleCount - 8; c++) {
			if (this.modules[6][c] !== null) {
				continue;
			}
			this.modules[6][c] = (c % 2 === 0);
		}
	},
	
	setupPositionAdjustPattern : function() {
	
		var pos = QRUtil.getPatternPosition(this.typeNumber);
		
		for (var i = 0; i < pos.length; i++) {
		
			for (var j = 0; j < pos.length; j++) {
			
				var row = pos[i];
				var col = pos[j];
				
				if (this.modules[row][col] !== null) {
					continue;
				}
				
				for (var r = -2; r <= 2; r++) {
				
					for (var c = -2; c <= 2; c++) {
					
						if (Math.abs(r) === 2 || 
                            Math.abs(c) === 2 ||
                            (r === 0 && c === 0) ) {
							this.modules[row + r][col + c] = true;
						} else {
							this.modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	},
	
	setupTypeNumber : function(test) {
	
		var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
	
		for (var i = 0; i < 18; i++) {
			mod = (!test && ( (bits >> i) & 1) === 1);
			this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
		}
	
		for (var x = 0; x < 18; x++) {
			mod = (!test && ( (bits >> x) & 1) === 1);
			this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
		}
	},
	
	setupTypeInfo : function(test, maskPattern) {
	
		var data = (this.errorCorrectLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
	
		// vertical		
		for (var v = 0; v < 15; v++) {
	
			mod = (!test && ( (bits >> v) & 1) === 1);
	
			if (v < 6) {
				this.modules[v][8] = mod;
			} else if (v < 8) {
				this.modules[v + 1][8] = mod;
			} else {
				this.modules[this.moduleCount - 15 + v][8] = mod;
			}
		}
	
		// horizontal
		for (var h = 0; h < 15; h++) {
	
			mod = (!test && ( (bits >> h) & 1) === 1);
			
			if (h < 8) {
				this.modules[8][this.moduleCount - h - 1] = mod;
			} else if (h < 9) {
				this.modules[8][15 - h - 1 + 1] = mod;
			} else {
				this.modules[8][15 - h - 1] = mod;
			}
		}
	
		// fixed module
		this.modules[this.moduleCount - 8][8] = (!test);
	
	},
	
	mapData : function(data, maskPattern) {
		
		var inc = -1;
		var row = this.moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		
		for (var col = this.moduleCount - 1; col > 0; col -= 2) {
	
			if (col === 6) col--;
	
			while (true) {
	
				for (var c = 0; c < 2; c++) {
					
					if (this.modules[row][col - c] === null) {
						
						var dark = false;
	
						if (byteIndex < data.length) {
							dark = ( ( (data[byteIndex] >>> bitIndex) & 1) === 1);
						}
	
						var mask = QRUtil.getMask(maskPattern, row, col - c);
	
						if (mask) {
							dark = !dark;
						}
						
						this.modules[row][col - c] = dark;
						bitIndex--;
	
						if (bitIndex === -1) {
							byteIndex++;
							bitIndex = 7;
						}
					}
				}
								
				row += inc;
	
				if (row < 0 || this.moduleCount <= row) {
					row -= inc;
					inc = -inc;
					break;
				}
			}
		}
		
	}

};

QRCode.PAD0 = 0xEC;
QRCode.PAD1 = 0x11;

QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
	
	var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
	
	var buffer = new QRBitBuffer();
	
	for (var i = 0; i < dataList.length; i++) {
		var data = dataList[i];
		buffer.put(data.mode, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
		data.write(buffer);
	}

	// calc num max data.
	var totalDataCount = 0;
	for (var x = 0; x < rsBlocks.length; x++) {
		totalDataCount += rsBlocks[x].dataCount;
	}

	if (buffer.getLengthInBits() > totalDataCount * 8) {
		throw new Error("code length overflow. (" + 
            buffer.getLengthInBits() + 
            ">" +  
            totalDataCount * 8 + 
            ")");
	}

	// end code
	if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
		buffer.put(0, 4);
	}

	// padding
	while (buffer.getLengthInBits() % 8 !== 0) {
		buffer.putBit(false);
	}

	// padding
	while (true) {
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD0, 8);
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD1, 8);
	}

	return QRCode.createBytes(buffer, rsBlocks);
};

QRCode.createBytes = function(buffer, rsBlocks) {

	var offset = 0;
	
	var maxDcCount = 0;
	var maxEcCount = 0;
	
	var dcdata = new Array(rsBlocks.length);
	var ecdata = new Array(rsBlocks.length);
	
	for (var r = 0; r < rsBlocks.length; r++) {

		var dcCount = rsBlocks[r].dataCount;
		var ecCount = rsBlocks[r].totalCount - dcCount;

		maxDcCount = Math.max(maxDcCount, dcCount);
		maxEcCount = Math.max(maxEcCount, ecCount);
		
		dcdata[r] = new Array(dcCount);
		
		for (var i = 0; i < dcdata[r].length; i++) {
			dcdata[r][i] = 0xff & buffer.buffer[i + offset];
		}
		offset += dcCount;
		
		var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
		var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);

		var modPoly = rawPoly.mod(rsPoly);
		ecdata[r] = new Array(rsPoly.getLength() - 1);
		for (var x = 0; x < ecdata[r].length; x++) {
            var modIndex = x + modPoly.getLength() - ecdata[r].length;
			ecdata[r][x] = (modIndex >= 0)? modPoly.get(modIndex) : 0;
		}

	}
	
	var totalCodeCount = 0;
	for (var y = 0; y < rsBlocks.length; y++) {
		totalCodeCount += rsBlocks[y].totalCount;
	}

	var data = new Array(totalCodeCount);
	var index = 0;

	for (var z = 0; z < maxDcCount; z++) {
		for (var s = 0; s < rsBlocks.length; s++) {
			if (z < dcdata[s].length) {
				data[index++] = dcdata[s][z];
			}
		}
	}

	for (var xx = 0; xx < maxEcCount; xx++) {
		for (var t = 0; t < rsBlocks.length; t++) {
			if (xx < ecdata[t].length) {
				data[index++] = ecdata[t][xx];
			}
		}
	}

	return data;

};

module.exports = QRCode;

}
};
const cache={};
function normalize(from,request){
  if(!request.startsWith('.')) return request;
  const base=from.split('/').slice(0,-1),parts=request.split('/');
  for(const p of parts){if(!p||p==='.')continue;if(p==='..')base.pop();else base.push(p);}
  return './'+base.filter(Boolean).join('/').replace(/^\.\//,'');
}
function load(id,from='./index'){
  const resolved=normalize(from,id).replace(/\.js$/,'');
  if(cache[resolved])return cache[resolved].exports;
  const factory=modules[resolved];if(!factory)throw new Error('Módulo QR ausente: '+resolved);
  const module={exports:{}};cache[resolved]=module;
  factory(module,module.exports,(request)=>load(request,resolved));return module.exports;
}
const QRCode=load('./index');
const Levels=load('./QRErrorCorrectLevel');
function create(text,level='M'){
  const value=String(text||'');if(!value)throw new Error('Informe um conteúdo para o QR Code.');
  const qr=new QRCode(-1,Levels[level]??Levels.M);qr.addData(value);qr.make();return qr;
}
function matrix(text,level='M'){
  const qr=create(text,level);return qr.modules.map(row=>row.map(Boolean));
}
function drawToCanvas(text,options={}){
  const modules=matrix(text,options.level||'M'),count=modules.length,margin=Math.max(4,Number(options.margin)||4),size=Math.max(128,Number(options.size)||512),cell=Math.max(1,Math.floor(size/(count+margin*2))),actual=cell*(count+margin*2),canvas=document.createElement('canvas');canvas.width=actual;canvas.height=actual;const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle=options.background||'#ffffff';ctx.fillRect(0,0,actual,actual);ctx.fillStyle=options.foreground||'#000000';for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(modules[y][x])ctx.fillRect((x+margin)*cell,(y+margin)*cell,cell,cell);return canvas;
}
function toDataURL(text,options={}){return drawToCanvas(text,options).toDataURL('image/png');}
function toBlob(text,options={}){const canvas=drawToCanvas(text,options);return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível gerar o QR Code.')),'image/png'));}
global.MarcoQr={create,matrix,drawToCanvas,toDataURL,toBlob,version:'local-mit-1'};
})(globalThis);

/* ===== js/services/pdf.js ===== */
(() => {
  'use strict';
  const enc=new TextEncoder();
  const ascii=s=>enc.encode(String(s));
  const MM=72/25.4;
  const PAGE_SIZES={A4:{w:210,h:297},Carta:{w:216,h:279},Ofício:{w:216,h:356}};
  function concat(chunks){let n=0;for(const c of chunks)n+=c.length;const out=new Uint8Array(n);let o=0;for(const c of chunks){out.set(c,o);o+=c.length;}return out;}
  function latinByte(ch){const code=ch.charCodeAt(0);if(code<=255)return code;const map={'€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159};return map[ch]||63;}
  function hexText(value){let out='';for(const ch of String(value??''))out+=latinByte(ch).toString(16).padStart(2,'0');return `<${out}>`;}
  function money(v){return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);}
  function date(v){if(!v)return '—';const d=new Date(String(v).length===10?`${v}T12:00:00`:v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-BR').format(d);}
  function dateTime(v=new Date()){const d=v instanceof Date?v:new Date(v);return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(d);}
  function cleanName(v){return String(v||'arquivo').replace(/[\\/:*?"<>|]/g,'-');}
  function hexRgb(value,fallback=[.07,.13,.20]){const m=String(value||'').match(/^#([0-9a-f]{6})$/i);if(!m)return fallback;const n=parseInt(m[1],16);return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];}
  function rgb(value,fallback){return hexRgb(value,fallback).map(x=>Number(x.toFixed(3))).join(' ');}
  function wrap(text,maxChars){const raw=String(text??'').replace(/\r\n?/g,'\n');if(!raw.trim())return ['—'];const lines=[];for(const paragraph of raw.split('\n')){const words=paragraph.trim().split(/\s+/).filter(Boolean);if(!words.length){lines.push('');continue;}let line='';for(const w of words){if(!line){line=w;continue;}if((line+' '+w).length<=maxChars)line+=' '+w;else{lines.push(line);line=w;}}if(line)lines.push(line);}return lines.length?lines:['—'];}
  function pageSize(template){const page=template?.page||{},base=PAGE_SIZES[page.size]||PAGE_SIZES.A4;return page.orientation==='landscape'?{w:base.h,h:base.w}:{...base};}
  function pagePts(template){const p=pageSize(template);return {w:p.w*MM,h:p.h*MM,mm:p};}
  async function toJpeg(blob,max=1800,quality=.86){
    if(!(blob instanceof Blob))throw new Error('Imagem inválida.');
    const bmp=await createImageBitmap(blob);const scale=Math.min(1,max/Math.max(bmp.width,bmp.height));const w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(bmp,0,0,w,h);bmp.close?.();
    const out=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));if(!out)throw new Error('Não foi possível converter a imagem.');return {bytes:new Uint8Array(await out.arrayBuffer()),width:w,height:h};
  }
  class Builder{
    constructor(){this.objects=[null];this.pages=[];this.pagesObj=this.reserve();this.catalogObj=this.reserve();this.fontRegular=this.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');this.fontBold=this.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');this.fontItalic=this.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>');}
    reserve(){this.objects.push(null);return this.objects.length-1;}
    add(value){const n=this.reserve();this.set(n,value);return n;}
    set(n,value){this.objects[n]=typeof value==='string'?ascii(value):value;}
    stream(bytes,dict=''){return this.add(concat([ascii(`<< /Length ${bytes.length}${dict?' '+dict:''} >>\nstream\n`),bytes,ascii('\nendstream')]));}
    image(bytes,w,h){return this.stream(bytes,`/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`);}
    page(commands,images={},size={w:595.28,h:841.89}){const content=this.stream(ascii(commands));const names=Object.entries(images).map(([k,v])=>`/${k} ${v} 0 R`).join(' ');const resources=`<< /Font << /F1 ${this.fontRegular} 0 R /F2 ${this.fontBold} 0 R /F3 ${this.fontItalic} 0 R >>${names?` /XObject << ${names} >>`:''} >>`;const page=this.add(`<< /Type /Page /Parent ${this.pagesObj} 0 R /MediaBox [0 0 ${size.w} ${size.h}] /Resources ${resources} /Contents ${content} 0 R >>`);this.pages.push(page);return page;}
    finish(){this.set(this.pagesObj,`<< /Type /Pages /Kids [${this.pages.map(n=>`${n} 0 R`).join(' ')}] /Count ${this.pages.length} >>`);this.set(this.catalogObj,`<< /Type /Catalog /Pages ${this.pagesObj} 0 R >>`);const chunks=[ascii('%PDF-1.4\n%âãÏÓ\n')],offsets=[0];let offset=chunks[0].length;for(let i=1;i<this.objects.length;i++){offsets[i]=offset;const part=concat([ascii(`${i} 0 obj\n`),this.objects[i],ascii('\nendobj\n')]);chunks.push(part);offset+=part.length;}const xref=offset;let table=`xref\n0 ${this.objects.length}\n0000000000 65535 f \n`;for(let i=1;i<this.objects.length;i++)table+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;table+=`trailer\n<< /Size ${this.objects.length} /Root ${this.catalogObj} 0 R >>\nstartxref\n${xref}\n%%EOF`;chunks.push(ascii(table));return new Blob([concat(chunks)],{type:'application/pdf'});}
  }
  function textCmd(text,x,y,size=10,bold=false,color='0.07 0.13 0.20',italic=false){return `BT ${color} rg /${bold?'F2':italic?'F3':'F1'} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${hexText(text)} Tj ET\n`;}
  function lineCmd(x1,y1,x2,y2,color='.82 .86 .9',width=.6){return `${color} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S\n`;}
  function rectCmd(x,y,w,h,{stroke='#c7d5e2',fill='',width=.6,opacity=1}={}){let cmd='';if(fill){cmd+=`${rgb(fill)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`;}if(stroke){cmd+=`${rgb(stroke)} RG ${width} w ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S\n`;}return cmd;}
  function mixHexColor(start,end,t){const a=hexRgb(start,[.02,.10,.20]),b=hexRgb(end,[.08,.48,.76]),toByte=value=>Math.max(0,Math.min(255,Math.round(value*255))),hex=value=>toByte(value).toString(16).padStart(2,'0');return `#${hex(a[0]+(b[0]-a[0])*t)}${hex(a[1]+(b[1]-a[1])*t)}${hex(a[2]+(b[2]-a[2])*t)}`;}
  function gradientCmd(c,template){
    const p=pagePts(template),x=(Number(c.x)||0)*MM,y=p.h-((Number(c.y)||0)+(Number(c.height)||0))*MM,w=(Number(c.width)||0)*MM,h=(Number(c.height)||0)*MM,steps=72,start=c.startColor||'#031a35',end=c.endColor||'#137bc2';
    if(w<=0||h<=0)return '';
    let cmd='';
    if(c.gradientDirection==='horizontal'){
      const band=w/steps;
      for(let i=0;i<steps;i++)cmd+=rectCmd(x+i*band,y,band+.35,h,{stroke:'',fill:mixHexColor(start,end,i/(steps-1))});
    }else{
      const band=h/steps;
      for(let i=0;i<steps;i++)cmd+=rectCmd(x,y+h-(i+1)*band,w,band+.35,{stroke:'',fill:mixHexColor(start,end,i/(steps-1))});
    }
    return cmd;
  }
  function imageCmd(name,x,y,w,h,clip=null){const clipCmd=clip?`${clip.x.toFixed(2)} ${clip.y.toFixed(2)} ${clip.w.toFixed(2)} ${clip.h.toFixed(2)} re W n `:'';return `q ${clipCmd}${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /${name} Do Q\n`;}
  function basicTemplate(){return {id:'pdf-template-basic',name:'Projeto PDF 1',version:1,schemaVersion:1,page:{size:'A4',orientation:'portrait',margins:{top:10,right:10,bottom:10,left:10}},pages:[{id:'main',name:'Principal',components:[{id:'t1',type:'title',x:10,y:12,width:190,height:14,text:'ORDEM DE SERVIÇO — {{osv.codigo}}',fontSize:18,bold:true,color:'#092b52'},{id:'t2',type:'text',x:10,y:32,width:190,height:28,text:'{{empresa.nome}}\n{{empresa.telefone}} • {{empresa.email}}\n{{empresa.endereco}}',fontSize:9},{id:'t3',type:'text',x:10,y:66,width:190,height:64,text:'Cliente: {{cliente.nome}}\nTelefone: {{cliente.telefone}}\nEquipamento: {{equipamento.nome}}\nMarca / Modelo: {{equipamento.modelo}}\nProblema: {{osv.problema}}\nLaudo: {{osv.laudo}}',fontSize:9},{id:'it',type:'table-items',x:10,y:136,width:190,height:76,fontSize:8,overflow:'next-page'},{id:'tot',type:'text',x:110,y:218,width:90,height:20,text:'Desconto geral: {{osv.desconto}}\nTotal final: {{osv.total}}',fontSize:11,bold:true,align:'right'},{id:'pn',type:'page-number',x:150,y:286,width:50,height:6,text:'Página {{pagina.numero}} de {{pagina.total}}',fontSize:7,align:'right'}]},{id:'photos',name:'Fotos',dynamic:true,components:[{id:'pt',type:'title',x:10,y:10,width:190,height:12,text:'REGISTRO FOTOGRÁFICO — {{osv.codigo}}',fontSize:16,bold:true},{id:'pg',type:'photos-grid',x:10,y:28,width:190,height:245,columns:2,perPage:4,hideWhenEmpty:true},{id:'pp',type:'page-number',x:150,y:286,width:50,height:6,text:'Página {{pagina.numero}} de {{pagina.total}}',fontSize:7,align:'right'}]}]};}
  function resolveTemplate(order,ctx){if(ctx?.template?.pages)return ctx.template;try{const d=typeof data==='function'?data():null,s=d?.settings,templates=s?.pdfTemplates||[],id=order?.pdfTemplateId||s?.defaultPdfTemplateId;return templates.find(t=>t.id===id)||templates.find(t=>t.isDefault)||templates[0]||basicTemplate();}catch(_){return basicTemplate();}}
  function variableMap(order,ctx,pageNo=1,totalPages=1){const client=ctx.client||{},company=ctx.company||{},address=[company.address,company.number,company.neighborhood,company.city].filter(Boolean).join(', '),clientAddress=[client.address,client.number,client.neighborhood,client.city].filter(Boolean).join(', ');return {
    '{{empresa.nome}}':company.name||'Marco Iris Soluções em Tecnologia','{{empresa.cnpj}}':company.document||'','{{empresa.telefone}}':company.phone||'','{{empresa.email}}':company.email||'','{{empresa.endereco}}':address,
    '{{osv.codigo}}':order.id||'','{{osv.data}}':date(order.openedAt),'{{osv.status}}':order.status||'','{{osv.problema}}':order.reportedIssue||'','{{osv.laudo}}':order.technicalReport||'','{{osv.servicoRealizado}}':order.technicalReport||'','{{osv.observacoes}}':order.clientNotes||'','{{osv.desconto}}':money(order.discount),'{{osv.total}}':money(order.total),
    '{{cliente.nome}}':client.name||order.clientName||'','{{cliente.telefone}}':client.phone||'','{{cliente.email}}':client.email||'','{{cliente.endereco}}':clientAddress,
    '{{equipamento.nome}}':order.equipmentType||'','{{equipamento.marca}}':order.brandModel||'','{{equipamento.modelo}}':order.brandModel||'','{{equipamento.numeroSerie}}':order.serialNumber||'','{{equipamento.serie}}':order.serialNumber||'',
    '{{financeiro.subtotal}}':money((Number(order.total)||0)+(Number(order.discount)||0)),'{{financeiro.desconto}}':money(order.discount),'{{financeiro.total}}':money(order.total),
    '{{pix.favorecido}}':order.pixPayment?.enabled?(order.pixPayment.beneficiary||''):'','{{pix.documento}}':order.pixPayment?.enabled?(order.pixPayment.beneficiaryDocument||''):'','{{pix.banco}}':order.pixPayment?.enabled?(order.pixPayment.bankName||''):'','{{pix.chave}}':order.pixPayment?.enabled?(order.pixPayment.pixKey||''):'','{{pix.codigoCopiaCola}}':order.pixPayment?.enabled?(order.pixPayment.copyPasteCode||order.pixPayment.pixKey||''):'','{{pix.qrCode}}':order.pixPayment?.enabled?'QR Code Pix':'',
    '{{pagina.numero}}':String(pageNo),'{{pagina.total}}':String(totalPages),'{{sistema.dataGeracao}}':dateTime(new Date())
  };}
  function resolveText(text,map){return Object.entries(map).reduce((out,[k,v])=>out.split(k).join(v),String(text||''));}
  function entriesFor(type,ctx){const all=ctx.items||[];if(type==='table-products')return all.filter(x=>String(x.type||'').toLowerCase().includes('produto'));if(type==='table-services')return all.filter(x=>String(x.type||'').toLowerCase().includes('serv'));if(type==='table-payments')return ctx.payments||[];return all;}
  function rowsFor(type,ctx){const itemName=it=>it.description||ctx.itemName?.(it)||[it.type,it.productId||it.serviceId||it.supplyId].filter(Boolean).join(' ');if(type==='table-payments')return (ctx.payments||[]).map(p=>{const status=globalThis.MarcoFinanceStatus?.effectiveStatus?.(p)||p.status||'Em aberto';return {a:p.paymentMethod||'—',b:p.paymentDate?`Pago em ${date(p.paymentDate)}`:p.dueDate?`${status} · ${date(p.dueDate)}`:status,c:money(p.grossValue||p.value)};});return entriesFor(type,ctx).map(it=>({a:`${Number(it.quantity)||0} × ${itemName(it)}`,b:money(it.unitPrice),c:money(Number(it.subtotal)||((Number(it.quantity)||0)*(Number(it.unitPrice)||0)))}));}
  function textMetrics(c,template,map){const p=pagePts(template),w=c.width*MM,size=Number(c.fontSize)||10,lineHeight=size*(Number(c.lineHeight)||1.28),maxChars=Math.max(4,Math.floor(w/(size*.52))),lines=wrap(resolveText(c.text||c.label||'',map),maxChars),maxLines=c.height?Math.max(1,Math.floor((c.height*MM)/lineHeight)):lines.length;return {p,w,size,lineHeight,lines,maxLines};}
  function tableMetrics(c,ctx){const rows=rowsFor(c.type,ctx),font=Number(c.fontSize)||8,rowH=Math.max(14,font*1.45),boxH=(Number(c.height)||50)*MM,capacity=Math.max(1,Math.floor(boxH/rowH)-1);return {rows,font,rowH,capacity};}
  function hasDynamicChunk(index,tables,overflowTexts,template,ctx,map){for(const c of tables){const {rows,capacity}=tableMetrics(c,ctx);if(rows.slice(index*capacity,(index+1)*capacity).length)return true;}for(const c of overflowTexts){const resolved=resolveText(c.text||c.label||'',map);if(!resolved.trim()&&c.hideWhenEmpty)continue;const metrics=textMetrics(c,template,map);if(metrics.lines.slice(index*metrics.maxLines,(index+1)*metrics.maxLines).length)return true;}return false;}
  function planPages(template,order,ctx){const plans=[],planningMap=variableMap(order,ctx,1,1);for(const page of template.pages||[]){const components=(page.components||[]).filter(c=>!String(c?.type||'').startsWith('pix-')),photoComp=components.find(c=>c.type==='photos-grid'),tables=components.filter(c=>String(c.type).startsWith('table-')),overflowTexts=components.filter(c=>c.overflow==='next-page'&&['text','title','subtitle','field','signature'].includes(c.type));if(photoComp){const photos=order.photos||[];if(!photos.length&&photoComp.hideWhenEmpty)continue;const per=Math.max(1,Number(photoComp.perPage)||4),chunks=[];for(let i=0;i<Math.max(1,photos.length);i+=per)chunks.push(photos.slice(i,i+per));if(!chunks.length)chunks.push([]);chunks.forEach((chunk,index)=>plans.push({page,photoChunk:chunk,photoIndex:index,tableChunkIndex:0,textChunkIndex:index,continuation:index>0}));continue;}let count=1;for(const c of tables){const {rows,capacity}=tableMetrics(c,ctx);count=Math.max(count,Math.ceil(rows.length/capacity)||1);}for(const c of overflowTexts){const resolved=resolveText(c.text||c.label||'',planningMap);if(!resolved.trim()&&c.hideWhenEmpty)continue;const metrics=textMetrics(c,template,planningMap);count=Math.max(count,Math.ceil(metrics.lines.length/metrics.maxLines)||1);}for(let i=0;i<count;i++){if(i>0&&!hasDynamicChunk(i,tables,overflowTexts,template,ctx,planningMap))continue;plans.push({page,photoChunk:null,tableChunkIndex:i,textChunkIndex:i,continuation:i>0});}}return plans.length?plans:[{page:basicTemplate().pages[0],tableChunkIndex:0,textChunkIndex:0,continuation:false}];}
  function textBoxCmd(text,c,template,map,chunkIndex=0){const metrics=textMetrics({...c,text},template,map),{p,w,size,lineHeight,maxLines}=metrics,lines=c.overflow==='next-page'?metrics.lines.slice(chunkIndex*maxLines,(chunkIndex+1)*maxLines):metrics.lines.slice(0,maxLines);if(!lines.length)return '';const x=c.x*MM,yTop=p.h-c.y*MM,color=rgb(c.color),align=c.align||'left';let cmd='';if(c.backgroundColor)cmd+=rectCmd(x,p.h-(c.y+c.height)*MM,w,c.height*MM,{stroke:'',fill:c.backgroundColor});for(let i=0;i<lines.length;i++){const line=lines[i],approx=line.length*size*.52;let tx=x;if(align==='center')tx=x+(w-approx)/2;else if(align==='right')tx=x+w-approx;const ty=yTop-size-i*lineHeight;cmd+=textCmd(line,Math.max(x,tx),ty,size,!!c.bold,color,!!c.italic);}if(c.underline){const y=yTop-size-2;cmd+=lineCmd(x,y,x+w,y,color,.5);}return cmd;}
  function tableCmd(c,template,ctx,chunkIndex,map){const {rows,font,rowH,capacity}=tableMetrics(c,ctx),slice=rows.slice(chunkIndex*capacity,(chunkIndex+1)*capacity);if(!slice.length&&(chunkIndex>0||c.hideWhenEmpty))return '';const p=pagePts(template),x=c.x*MM,yTop=p.h-c.y*MM,w=c.width*MM,col1=w*.62,col2=w*.18,col3=w*.20;let cmd=rectCmd(x,yTop-rowH,w,rowH,{fill:'#e8f1f8',stroke:'#9db7cd'});const title=c.type==='table-payments'?'PAGAMENTOS':c.type==='table-products'?'Produtos':c.type==='table-services'?'Serviços':'Itens e serviços';cmd+=textCmd(title,x+4,yTop-rowH+4,font,true,rgb('#092b52'));cmd+=textCmd(c.type==='table-payments'?'Status':'Unitário',x+col1+3,yTop-rowH+4,font,true,rgb('#092b52'));cmd+=textCmd('Total',x+col1+col2+3,yTop-rowH+4,font,true,rgb('#092b52'));let y=yTop-rowH;for(const row of slice){y-=rowH;cmd+=rectCmd(x,y,w,rowH,{stroke:'#cad6e1',fill:''});cmd+=lineCmd(x+col1,y,x+col1,y+rowH,rgb('#cad6e1'));cmd+=lineCmd(x+col1+col2,y,x+col1+col2,y+rowH,rgb('#cad6e1'));const a=wrap(row.a,Math.max(8,Math.floor(col1/(font*.52)))).slice(0,2);a.forEach((line,i)=>{cmd+=textCmd(line,x+4,y+rowH-font-2-i*(font+1),font,false,rgb('#25394e'));});cmd+=textCmd(row.b,x+col1+3,y+rowH-font-3,font,false,rgb('#25394e'));cmd+=textCmd(row.c,x+col1+col2+3,y+rowH-font-3,font,!!c.bold,rgb('#25394e'));}return cmd;}
  async function resolveAssetBlob(c){try{if(c.assetLocalKey&&globalThis.MarcoStorage?.getMedia){const rec=await MarcoStorage.getMedia(c.assetLocalKey);if(rec?.blob)return rec.blob;}if(c.assetUrl){const response=await fetch(c.assetUrl);if(response.ok)return await response.blob();}}catch(error){console.warn?.('Imagem opcional do PDF indisponível:',c.assetUrl||c.assetLocalKey,error?.message||error);}return null;}
  function imageQuality(template){const quality=template?.quality||'standard';return quality==='optimized'?{max:1200,jpeg:.74}:quality==='high'?{max:2400,jpeg:.94}:{max:1600,jpeg:.86};}
  async function renderImageComponent(c,b,template,images,imageSeq){const blob=await resolveAssetBlob(c);if(!blob)return {cmd:'',imageSeq};try{const quality=imageQuality(template),img=await toJpeg(blob,quality.max,quality.jpeg),obj=b.image(img.bytes,img.width,img.height),name=`Img${imageSeq++}`,p=pagePts(template),box={x:c.x*MM,y:p.h-(c.y+c.height)*MM,w:c.width*MM,h:c.height*MM};const cover=c.fit==='cover',scale=cover?Math.max(box.w/img.width,box.h/img.height):Math.min(box.w/img.width,box.h/img.height),w=img.width*scale,h=img.height*scale,x=box.x+(box.w-w)/2,y=box.y+(box.h-h)/2;images[name]=obj;return {cmd:imageCmd(name,x,y,w,h,cover?box:null),imageSeq};}catch(error){console.warn?.('Imagem opcional do PDF ignorada por falha de leitura:',c.assetName||c.assetUrl||c.assetLocalKey,error?.message||error);return {cmd:'',imageSeq};}}
  async function renderPixQrComponent(c,b,template,order,images,imageSeq){
    const code=String(order?.pixPayment?.copyPasteCode||order?.pixPayment?.pixKey||'').trim();if(!order?.pixPayment?.enabled||!code||!globalThis.MarcoQr)return {cmd:'',imageSeq};
    try{const blob=await MarcoQr.toBlob(code,{size:900,margin:4,level:'Q'}),img=await toJpeg(blob,1200,.96),obj=b.image(img.bytes,img.width,img.height),name=`PixQr${imageSeq++}`,p=pagePts(template),box={x:c.x*MM,y:p.h-(c.y+c.height)*MM,w:c.width*MM,h:c.height*MM},side=Math.min(box.w,box.h),x=box.x+(box.w-side)/2,y=box.y+(box.h-side)/2;images[name]=obj;let cmd=rectCmd(box.x,box.y,box.w,box.h,{stroke:'#c7d5e2',fill:'#ffffff',width:.5});cmd+=imageCmd(name,x,y,side,side);return {cmd,imageSeq};}catch(error){console.warn?.('QR Code Pix não pôde ser renderizado:',error?.message||error);return {cmd:'',imageSeq};}
  }
  async function photosGrid(c,b,template,photos,ctx,images,imageSeq,map){if(!photos.length&&c.hideWhenEmpty)return {cmd:'',imageSeq};const p=pagePts(template),columns=Math.max(1,Math.min(3,Number(c.columns)||2)),gap=4*MM,x=c.x*MM,yTop=p.h-c.y*MM,w=c.width*MM,h=c.height*MM,rows=Math.max(1,Math.ceil(Math.max(1,photos.length)/columns)),cellW=(w-gap*(columns-1))/columns,cellH=(h-gap*(rows-1))/rows;let cmd='';for(let i=0;i<photos.length;i++){const meta=photos[i];try{const blob=await ctx.getPhotoBlob?.(meta);if(!blob)continue;const quality=imageQuality(template),img=await toJpeg(blob,quality.max,quality.jpeg),obj=b.image(img.bytes,img.width,img.height),name=`Photo${imageSeq++}`,col=i%columns,row=Math.floor(i/columns),cellX=x+col*(cellW+gap),cellY=yTop-(row+1)*cellH-row*gap,caption=c.showCaption!==false?14:0,fitH=cellH-caption,scale=Math.min(cellW/img.width,fitH/img.height),iw=img.width*scale,ih=img.height*scale,ix=cellX+(cellW-iw)/2,iy=cellY+caption+(fitH-ih)/2;images[name]=obj;cmd+=rectCmd(cellX,cellY,cellW,cellH,{stroke:'#c7d4df'});cmd+=imageCmd(name,ix,iy,iw,ih);if(c.showCaption!==false)cmd+=textCmd(meta.fileName||`Foto ${i+1}`,cellX+3,cellY+4,7,false,rgb('#637487'));}catch(e){console.warn('Foto ignorada no PDF:',e);}}return {cmd,imageSeq};}
  async function renderPlan(plan,index,total,b,template,order,ctx){
    const p=pagePts(template),map=variableMap(order,ctx,index+1,total),images={};
    const sorted=[...(plan.page.components||[])].sort((a,b)=>(a.zIndex||0)-(b.zIndex||0));
    const overflowTexts=sorted.filter(c=>c.overflow==='next-page'&&['text','title','subtitle','field','signature'].includes(c.type));
    const tables=sorted.filter(c=>String(c.type||'').startsWith('table-'));
    const chunkIndex=plan.textChunkIndex||0;
    const hasTextChunk=overflowTexts.some(c=>{
      const metrics=textMetrics(c,template,map);
      return metrics.lines.slice(chunkIndex*metrics.maxLines,(chunkIndex+1)*metrics.maxLines).length>0;
    });
    const minDynamicY=Math.min(...[...overflowTexts,...tables].map(c=>Number(c.y)||0),Infinity);
    const minTableY=Math.min(...tables.map(c=>Number(c.y)||0),Infinity);
    let cmd='',imageSeq=1;
    for(const original of sorted){
      if(original.hidden||String(original.type||'').startsWith('pix-'))continue;
      if(plan.continuation&&!String(original.type||'').startsWith('table-')&&original.type!=='photos-grid'&&original.overflow!=='next-page'&&!original.repeatOnEveryPage&&!['page-number','generation-date','logo'].includes(original.type)&&Number(original.y)>45)continue;
      let c=original;
      if(plan.continuation&&(original.overflow==='next-page'||String(original.type||'').startsWith('table-'))){
        c={...original};
        if(String(original.type||'').startsWith('table-')&&!hasTextChunk&&Number.isFinite(minTableY))c.y=(Number(original.y)||0)+(55-minTableY);
        else if(Number.isFinite(minDynamicY))c.y=(Number(original.y)||0)+(55-minDynamicY);
      }
      if(['text','title','subtitle','field','signature','page-number','generation-date'].includes(c.type)){
        const resolved=resolveText(c.text||c.label,map);if(!resolved.trim()&&c.hideWhenEmpty)continue;
        cmd+=textBoxCmd(resolved,c,template,map,plan.textChunkIndex||0);continue;
      }
      if(c.type==='line'){const x=c.x*MM,y=p.h-c.y*MM;cmd+=lineCmd(x,y,x+c.width*MM,y,rgb(c.color||'#2d72b8'),Math.max(.4,Number(c.strokeWidth)||1));continue;}
      if(c.type==='gradient'){cmd+=gradientCmd(c,template);continue;}
      if(c.type==='rect'){const x=c.x*MM,y=p.h-(c.y+c.height)*MM;cmd+=rectCmd(x,y,c.width*MM,c.height*MM,{stroke:c.color||'#2d72b8',fill:c.backgroundColor||''});continue;}
      if(c.type==='logo'||c.type==='image'){const out=await renderImageComponent(c,b,template,images,imageSeq);cmd+=out.cmd;imageSeq=out.imageSeq;continue;}
      if(c.type==='pix-qr'){const out=await renderPixQrComponent(c,b,template,order,images,imageSeq);cmd+=out.cmd;imageSeq=out.imageSeq;continue;}
      if(String(c.type).startsWith('table-')){cmd+=tableCmd(c,template,ctx,plan.tableChunkIndex||0,map);continue;}
      if(c.type==='photos-grid'){const out=await photosGrid(c,b,template,plan.photoChunk||[],ctx,images,imageSeq,map);cmd+=out.cmd;imageSeq=out.imageSeq;continue;}
    }
    b.page(cmd,images,{w:p.w,h:p.h});
  }
  async function generateVisual(order,ctx,template){const b=new Builder(),plans=planPages(template,order,ctx);for(let i=0;i<plans.length;i++)await renderPlan(plans[i],i,plans.length,b,template,order,ctx);const stamp=new Date().toLocaleString('sv-SE',{hour12:false}).replace(' ','_').replace(/:/g,'-');return {blob:b.finish(),fileName:`${cleanName(order.id)}_${stamp}.pdf`,templateId:template.id||'',templateVersion:template.version||1,pageCount:plans.length};}
  async function generate(order,ctx={}){const template=resolveTemplate(order,ctx);return await generateVisual(order,ctx,template);}
  window.MarcoPdf={generate,resolveTemplate,basicTemplate};
})();

/* ===== js/services/borion-interop-source.js ===== */
(() => {
  'use strict';

  /* BORION INTEROP SOURCE v3.0.0 — MIT -> BORION
     Segurança: identidade de empresa compartilhada, identidade de dispositivo,
     bloqueio de publicação antes da carga oficial e proteção contra snapshot vazio. */
  const SPEC = Object.freeze({
    schema: 'borion.interop.snapshot', schemaVersion: 2, bridgeVersion: '3.0.1',
    sourceAppId: 'marco-iris', sourceAppName: 'Marco Iris Tecnologia', sourceAppVersion: '2.8.3',
    targetProfileAlias: 'default', snapshotFile: 'marco-iris.bridge.json', ackFile: 'marco-iris.ack.json',
    integrationFolder: 'Borion_Integracoes'
  });
  const DEVICE_KEY='marco_iris_device_id_v240_clean';
  const runtime={started:false,ready:false,initialSyncComplete:false,paused:new Set(),status:'waiting-authentication',reason:'Aguardando autenticação e base oficial.'};
  let timer=null,interval=null,stateGetter=null,publishRequested=0,publishCompleted=0,publishState=null,publishLoopPromise=null,publishWaiters=[];

  function clone(value){ return value==null?value:JSON.parse(JSON.stringify(value)); }
  function nowIso(){ return new Date().toISOString(); }
  function todayIso(){ return nowIso().slice(0,10); }
  function randomId(){
    if(globalThis.crypto&&typeof globalThis.crypto.randomUUID==='function')return globalThis.crypto.randomUUID();
    return 'id_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,12);
  }
  function getDeviceId(){
    try{let id=localStorage.getItem(DEVICE_KEY);if(!id){id=randomId();localStorage.setItem(DEVICE_KEY,id);}return id;}catch(_e){if(!runtime.deviceId)runtime.deviceId=randomId();return runtime.deviceId;}
  }
  function normalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();}
  function stableStringify(value){
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableStringify(value[k])).join(',')+'}';
  }
  function hash(value){const text=typeof value==='string'?value:stableStringify(value);let h=2166136261;for(let i=0;i<text.length;i+=1){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return ('00000000'+(h>>>0).toString(16)).slice(-8);}
  function activeData(state){if(!state||!state.dataByProfile)return null;const id=state.activeProfileId||(state.profiles&&state.profiles[0]&&state.profiles[0].id);return id?state.dataByProfile[id]:null;}
  function isBridgeExcluded(item){return !!(item?.excludeFromBorion||item?.bridgeEligible===false||(item?.legacyImported&&item?.migrationOrigin==='MarcoIris-AppSheet-Legacy'));}
  function countSourceRecords(state){const data=activeData(state);return data&&Array.isArray(data.payments)?data.payments.filter(item=>!isBridgeExcluded(item)).length:0;}

  function ensureBridgeState(state){
    if(!state||typeof state!=='object')throw new Error('Estado do Marco Iris indisponível.');
    if(!state.interconnections||typeof state.interconnections!=='object')state.interconnections={};
    if(!state.interconnections.borion||typeof state.interconnections.borion!=='object')state.interconnections.borion={};
    const bridge=state.interconnections.borion;
    const previousSchemaVersion=Math.max(0,Number(bridge.schemaVersion)||0);
    /* Migração: o antigo instanceId da base oficial passa a ser companyInstanceId.
       Nunca é criado por navegador depois que a base remota foi carregada. */
    bridge.companyInstanceId=String(bridge.companyInstanceId||bridge.instanceId||'').trim();
    if(!bridge.companyInstanceId)bridge.companyInstanceId=randomId();
    bridge.instanceId=bridge.companyInstanceId; // alias legado, somente leitura conceitual
    bridge.deviceId=getDeviceId();
    bridge.schemaVersion=3;bridge.protectedBoundary=true;bridge.changePolicy='explicit-request-only';
    bridge.sourceAppId=SPEC.sourceAppId;bridge.targetProfileAlias=SPEC.targetProfileAlias;
    bridge.revision=Math.max(0,Number(bridge.revision)||0);bridge.shadow=bridge.shadow&&typeof bridge.shadow==='object'?bridge.shadow:{};
    if(previousSchemaVersion<3){
      /* As versões antigas indexavam shadow pelo aggregateId. O protocolo 2 usa
         sourceRecordId. Limpar somente o índice técnico evita gerar tombstones
         falsos durante a migração; os registros reais continuam intactos. */
      bridge.shadow={};bridge.tombstones=[];bridge.identityMigratedAt=bridge.identityMigratedAt||nowIso();
    }
    bridge.tombstones=Array.isArray(bridge.tombstones)?bridge.tombstones:[];bridge.recordAcks=bridge.recordAcks&&typeof bridge.recordAcks==='object'?bridge.recordAcks:{};
    bridge.lastContentHash=String(bridge.lastContentHash||'');bridge.lastPublishAt=String(bridge.lastPublishAt||'');
    bridge.lastPublishStatus=String(bridge.lastPublishStatus||'prepared-offline');bridge.lastError=String(bridge.lastError||'');
    bridge.lastAckAt=String(bridge.lastAckAt||'');bridge.lastAckRevision=Math.max(0,Number(bridge.lastAckRevision)||0);
    return bridge;
  }

  function statusCode(item){const s=normalize(item?.status);if(s.includes('cancel')||item?.cancelledAt)return 'cancelled';if(item?.paymentDate||s==='pago'||s==='recebido'||s==='realizado')return 'paid';if(s.includes('atras')||s.includes('vencid'))return 'overdue';return 'open';}
  function paymentMethodLabel(item){const raw=String(item?.paymentMethod||'').trim()||'Não informado';const n=Math.max(0,Number(item?.installments||item?.parcelas||item?.installmentCount||0)||0);if(normalize(raw).includes('credito')&&n>1&&!/\d+x/i.test(raw))return `Crédito ${n}x`;return raw;}
  function clientForPayment(data,item,order){if(order?.clientName)return order.clientName;const byId=(data.clients||[]).find(c=>String(c.id)===String(item.clientId));return byId?.name||item.clientName||'';}
  function expenseName(item,order){return String(item.expenseName||item.name||item.description||item.notes||(order?`Despesa vinculada à ${order.id}`:'Despesa MIT')).trim();}
  function externalReference(item,orderId){return String(item.externalReference||[orderId,item.id].filter(Boolean).join(':')||item.id);}

  function projectRecord(item,state,bridge){
    if(!item||!item.id||isBridgeExcluded(item))return null;const data=activeData(state)||{};const order=(data.serviceOrders||[]).find(x=>String(x.id)===String(item.orderId));
    const status=statusCode(item),direction=normalize(item.type)==='despesa'?'expense':'income',amount=Math.round((Number(item.value)||0)*100)/100;
    const entityId=String(item.code||item.id),receiptId=entityId,orderNumber=String(item.orderId||order?.id||''),clientName=clientForPayment(data,item,order),method=paymentMethodLabel(item),isIncome=direction==='income';
    const description=isIncome?`${orderNumber||'Sem OSV'} • ${clientName||'Cliente não informado'}`:expenseName(item,order);
    const date=(isIncome?item.paymentDate:(item.paymentDate||item.dueDate))||item.createdAt?.slice?.(0,10)||todayIso();
    const kind=isIncome?'receipt':'expense';const sourceRecordId=`marco:${kind}:${entityId}`;
    const aggregateId=`${SPEC.sourceAppId}:${bridge.companyInstanceId}:${kind}:${entityId}`;
    const payload={
      aggregateId,uniqueKey:`${isIncome?'REC':'DES'}:${entityId}`,idempotencyKey:sourceRecordId,
      sourceSystem:SPEC.sourceAppId,sourceRecordId,sourceEntityType:kind,operationType:status==='cancelled'?'cancel':'upsert',
      entityType:kind,entityId,receiptId,orderNumber,direction,amount,value:amount,currency:'BRL',date,dueDate:item.dueDate||'',paymentDate:item.paymentDate||'',status,
      active:status!=='cancelled'&&amount>0,settled:status==='paid',importPolicy:isIncome?'automatic-when-paid':'automatic-when-mapped',description,
      name:isIncome?description:expenseName(item,order),localPurchase:String(item.localPurchase||item.purchaseLocation||item.local||''),
      category:isIncome?'MIT':String(item.expenseCategory||item.category||'Outro'),paymentMethod:method,paymentOrigin:isIncome?'':String(item.paymentOrigin||'').trim(),
      expenseType:isIncome?'':(normalize(item.expenseType)==='fixa'?'fixa':'variavel'),installments:Math.max(1,Number(item.installments||item.parcelas||item.installmentCount||1)||1),
      clientName,origin:'MIT',sourceAppDisplayName:'Marco Iris Tec',notes:item.notes||'',externalReference:externalReference(item,orderNumber),
      sourceUpdatedAt:item.updatedAt||state.updatedAt||nowIso(),
      sourceLabels:{receiptId:'ID do recebimento',orderNumber:'Número da OSV',clientName:'Cliente',amount:'Valor',paymentDate:'Data do pagamento',paymentMethod:'Forma de pagamento',status:'Status',externalReference:'Referência externa',name:'Nome',localPurchase:'Local da compra',paymentOrigin:'Origem do pagamento',expenseType:'Tipo de despesa'},
      raw:{'ID do recebimento':receiptId,'Número da OSV':orderNumber,'Nome do cliente':clientName,'Nome':isIncome?description:expenseName(item,order),'Local da compra':String(item.localPurchase||item.purchaseLocation||item.local||''),'Valor':amount,'Data do pagamento':item.paymentDate||'','Data de vencimento':item.dueDate||'','Forma de pagamento':method,'Origem do pagamento':isIncome?'':String(item.paymentOrigin||''),'Tipo de despesa':isIncome?'':(normalize(item.expenseType)==='fixa'?'Fixa':'Variável'),'Status':status,'Referência externa':externalReference(item,orderNumber)}
    };
    payload.fingerprint=hash(payload);return payload;
  }
  function projectRecords(state){const bridge=ensureBridgeState(state),data=activeData(state),items=data&&Array.isArray(data.payments)?data.payments:[],dedupe=new Map();items.forEach(item=>{try{const r=projectRecord(item,state,bridge);if(r&&r.sourceRecordId)dedupe.set(r.sourceRecordId,r);}catch(e){console.warn('[BORION_INTEROP_SOURCE] Registro ignorado:',e);}});return [...dedupe.values()].sort((a,b)=>a.sourceRecordId.localeCompare(b.sourceRecordId));}

  function reconcileState(state){
    const bridge=ensureBridgeState(state),records=projectRecords(state),current=new Map(records.map(r=>[r.sourceRecordId,r])),previous=bridge.shadow||{};
    const tombstoneMap=new Map((bridge.tombstones||[]).map(t=>[String(t.sourceRecordId||t.aggregateId),t]));
    Object.keys(previous).forEach(id=>{if(!current.has(id)){const parts=String(id).split(':'),kind=parts[1]||'receipt',entityId=parts.slice(2).join(':')||parts[parts.length-1]||id,aggregateId=`${SPEC.sourceAppId}:${bridge.companyInstanceId}:${kind}:${entityId}`;tombstoneMap.set(id,{sourceRecordId:id,aggregateId,entityId,operationType:'delete',deletedAt:nowIso(),deviceId:bridge.deviceId,revision:bridge.revision+1,reason:'source-record-removed'});}});
    current.forEach((_r,id)=>tombstoneMap.delete(id));bridge.shadow=Object.fromEntries(records.map(r=>[r.sourceRecordId,r.fingerprint]));
    const cutoff=Date.now()-366*24*60*60*1000;bridge.tombstones=[...tombstoneMap.values()].filter(x=>!x.deletedAt||new Date(x.deletedAt).getTime()>=cutoff).sort((a,b)=>String(a.sourceRecordId||a.aggregateId).localeCompare(String(b.sourceRecordId||b.aggregateId))).slice(-4000);
    const content={companyInstanceId:bridge.companyInstanceId,records,tombstones:bridge.tombstones};const contentHash=hash(content);
    if(contentHash!==bridge.lastContentHash){bridge.revision+=1;bridge.lastContentHash=contentHash;}
    const generatedAt=nowIso();const snapshot={schema:SPEC.schema,schemaVersion:SPEC.schemaVersion,bridgeVersion:SPEC.bridgeVersion,sourceAppId:SPEC.sourceAppId,sourceAppName:SPEC.sourceAppName,sourceAppVersion:SPEC.sourceAppVersion,
      companyInstanceId:bridge.companyInstanceId,instanceId:bridge.companyInstanceId,deviceId:bridge.deviceId,targetProfileAlias:SPEC.targetProfileAlias,revision:bridge.revision,generatedAt,sourceUpdatedAt:state.updatedAt||generatedAt,
      recordCount:records.length,isCompleteSnapshot:true,completeSnapshot:true,contentHash,checksum:hash({companyInstanceId:bridge.companyInstanceId,revision:bridge.revision,contentHash,records,tombstones:bridge.tombstones}),records,tombstones:clone(bridge.tombstones)};
    return snapshot;
  }

  async function writeJsonToDirectory(rootHandle,filename,object){const dir=rootHandle.name===SPEC.integrationFolder?rootHandle:await rootHandle.getDirectoryHandle(SPEC.integrationFolder,{create:true});const fh=await dir.getFileHandle(filename,{create:true});const w=await fh.createWritable();await w.write(new Blob([JSON.stringify(object,null,2)],{type:'application/json'}));await w.close();return dir;}
  async function readJsonFromDirectory(rootHandle,filename){try{const dir=rootHandle.name===SPEC.integrationFolder?rootHandle:await rootHandle.getDirectoryHandle(SPEC.integrationFolder);const fh=await dir.getFileHandle(filename);return JSON.parse(await(await fh.getFile()).text());}catch(e){if(e&&(e.name==='NotFoundError'||e.name==='TypeMismatchError'))return null;throw e;}}
  function snapshotCompany(snapshot){return String(snapshot?.companyInstanceId||snapshot?.instanceId||'');}
  function validateCandidateAgainstRemote(candidate,remote){
    if(!remote)return {ok:true};const localCompany=snapshotCompany(candidate),remoteCompany=snapshotCompany(remote);
    if(remoteCompany&&localCompany!==remoteCompany)return {ok:false,code:'INSTANCE_CONFLICT',message:'A origem oficial da integração é diferente. A publicação foi bloqueada.'};
    const rr=Math.max(0,Number(remote.revision)||0),lr=Math.max(0,Number(candidate.revision)||0),remoteRecords=Array.isArray(remote.records)?remote.records:[],candidateRecords=Array.isArray(candidate.records)?candidate.records:[],remoteCount=Number(remote.recordCount??remoteRecords.length??0),localCount=Number(candidate.recordCount??candidateRecords.length??0);
    const tombstoneKeys=new Set((candidate.tombstones||[]).flatMap(item=>[String(item?.sourceRecordId||''),String(item?.aggregateId||''),String(item?.entityId||'')]).filter(Boolean));
    const candidateKeys=new Set(candidateRecords.flatMap(item=>[String(item?.sourceRecordId||''),String(item?.aggregateId||''),String(item?.entityId||'')]).filter(Boolean));
    const removedRemote=remoteRecords.filter(item=>{const keys=[String(item?.sourceRecordId||''),String(item?.aggregateId||''),String(item?.entityId||'')].filter(Boolean);return keys.length&&!keys.some(key=>candidateKeys.has(key));});
    const explicitDeletionCoverage=removedRemote.length>0&&removedRemote.every(item=>[String(item?.sourceRecordId||''),String(item?.aggregateId||''),String(item?.entityId||'')].filter(Boolean).some(key=>tombstoneKeys.has(key)));
    if(remoteCount>0&&localCount===0&&!explicitDeletionCoverage)return {ok:false,code:'EMPTY_BASE_BLOCKED',message:'A base local está vazia, mas o Google Drive contém dados e não há exclusões explícitas suficientes. A publicação foi bloqueada.'};
    if(remoteCount>=4&&localCount<Math.ceil(remoteCount*.5)&&!explicitDeletionCoverage)return {ok:false,code:'SUSPICIOUS_DROP',message:'Redução anormal de registros sem exclusões explícitas. Publicação bloqueada.'};
    /* O bridge é um artefato derivado da base oficial. A revisão do bridge pode ficar
       à frente da revisão gravada dentro do current principal após uma aba ser fechada
       entre duas confirmações. Para a mesma empresa, um snapshot completo vindo da base
       oficial pode substituir o bridge antigo; a concorrência real continua protegida
       pelo arquivo principal do Drive. */
    return {ok:true,sameContent:remoteCompany===localCompany&&remote.contentHash===candidate.contentHash,remoteRevision:rr,localRevision:lr,explicitDeletionCoverage};
  }

  function applyAcknowledgement(state,ack){
    if(!ack||ack.schema!=='borion.interop.ack'||ack.sourceAppId!==SPEC.sourceAppId)return false;const bridge=ensureBridgeState(state),company=String(ack.companyInstanceId||ack.instanceId||'');
    if(company&&company!==bridge.companyInstanceId)return false;bridge.lastAckAt=ack.processedAt||nowIso();bridge.lastAckRevision=Number(ack.sourceRevision)||0;
    (ack.records||[]).forEach(item=>{const key=String(item.sourceRecordId||item.aggregateId||item.entityId||'');if(key)bridge.recordAcks[key]=item;});
    const data=activeData(state),items=data&&Array.isArray(data.payments)?data.payments:[];const byEntity=new Map((ack.records||[]).filter(x=>x.entityId).map(x=>[String(x.entityId),x]));
    items.forEach(item=>{const result=byEntity.get(String(item.code||item.id));if(!result)return;item.borionSync={status:result.result||result.status||'processed',borionTransactionId:result.borionId||result.borionTransactionId||'',targetProfileId:ack.targetProfileId||'',processedAt:result.processedAt||ack.processedAt||nowIso(),message:result.message||''};});
    return true;
  }

  function canPublish(){return runtime.started&&runtime.ready&&runtime.initialSyncComplete&&runtime.paused.size===0;}
  function setReady(state,context={}){if(state)ensureBridgeState(state);runtime.ready=true;runtime.initialSyncComplete=true;runtime.status='ready';runtime.reason='Base oficial carregada e validada.';if(context.companyInstanceId&&state){const b=ensureBridgeState(state);if(b.companyInstanceId!==context.companyInstanceId)throw new Error('companyInstanceId diverge da base oficial.');}schedule(state||stateGetter?.(),40);return getRuntimeStatus();}
  function setNotReady(reason='Sincronização inicial incompleta.'){runtime.ready=false;runtime.initialSyncComplete=false;runtime.status='blocked';runtime.reason=reason;clearTimeout(timer);return getRuntimeStatus();}
  function pause(reason='operation'){runtime.paused.add(String(reason));clearTimeout(timer);runtime.status='paused';runtime.reason=String(reason);return getRuntimeStatus();}
  function resume(reason='operation'){runtime.paused.delete(String(reason));if(canPublish()){runtime.status='ready';runtime.reason='Base oficial carregada e validada.';schedule(stateGetter?.(),60);}return getRuntimeStatus();}
  function getRuntimeStatus(){return {started:runtime.started,ready:runtime.ready,initialSyncComplete:runtime.initialSyncComplete,paused:[...runtime.paused],status:runtime.status,reason:runtime.reason,deviceId:getDeviceId(),publishRequested,publishCompleted,publishInFlight:!!publishLoopPromise};}

  async function publishOnce(state){
    const bridge=ensureBridgeState(state);let snapshot;const destinations=[],errors=[];
    try{
      snapshot=reconcileState(state);await MarcoStorage.save(state);
      try{const handle=await MarcoStorage.getFolderHandle();if(handle&&await MarcoStorage.ensurePermission(handle,false)){const remote=await readJsonFromDirectory(handle,SPEC.snapshotFile);const guard=validateCandidateAgainstRemote(snapshot,remote);if(!guard.ok)throw Object.assign(new Error(guard.message),{code:guard.code});if(!guard.sameContent){await writeJsonToDirectory(handle,SPEC.snapshotFile,snapshot);destinations.push('local-folder');}else destinations.push('local-unchanged');const ack=await readJsonFromDirectory(handle,SPEC.ackFile);if(ack&&applyAcknowledgement(state,ack))destinations.push('local-ack');}}catch(e){errors.push('Pasta local: '+(e.message||String(e)));if(['INSTANCE_CONFLICT','EMPTY_BASE_BLOCKED','SUSPICIOUS_DROP','REMOTE_NEWER'].includes(e.code))throw e;}
      try{const drive=window.GoogleDriveMarco;if(drive&&drive.isConfigured&&drive.isConfigured()&&drive.writeIntegrationJson){const remote=await drive.readIntegrationJson(SPEC.snapshotFile);const guard=validateCandidateAgainstRemote(snapshot,remote);if(!guard.ok)throw Object.assign(new Error(guard.message),{code:guard.code});if(!guard.sameContent){await drive.writeIntegrationJson(SPEC.snapshotFile,snapshot);const confirmed=await drive.readIntegrationJson(SPEC.snapshotFile);if(!confirmed||snapshotCompany(confirmed)!==bridge.companyInstanceId||confirmed.contentHash!==snapshot.contentHash||Number(confirmed.revision)!==Number(snapshot.revision))throw Object.assign(new Error('O bridge gravado não foi confirmado pelo Google Drive.'),{code:'BRIDGE_CONFIRMATION_FAILED'});destinations.push('google-drive');}else destinations.push('google-unchanged');const ack=await drive.readIntegrationJson(SPEC.ackFile);if(ack&&applyAcknowledgement(state,ack))destinations.push('google-ack');}}catch(e){errors.push('Google Drive: '+(e.message||String(e)));if(['INSTANCE_CONFLICT','EMPTY_BASE_BLOCKED','SUSPICIOUS_DROP','REMOTE_NEWER'].includes(e.code))throw e;}
      bridge.lastPublishAt=nowIso();bridge.lastPublishStatus=destinations.some(x=>x.includes('drive')||x.includes('folder'))?'published':(destinations.some(x=>x.includes('unchanged'))?'unchanged':'prepared-offline');bridge.lastError=errors.join(' | ');await MarcoStorage.save(state);return {snapshot,destinations,errors};
    }catch(error){bridge.lastPublishStatus='blocked';bridge.lastError=error.message||String(error);runtime.status='blocked';runtime.reason=bridge.lastError;await MarcoStorage.save(state).catch(()=>{});return {snapshot,blocked:true,code:error.code||'PUBLISH_FAILED',message:bridge.lastError,destinations,errors};}
  }
  function settlePublishWaiters(target,result,error){const keep=[];for(const waiter of publishWaiters){if(waiter.seq<=target){error?waiter.reject(error):waiter.resolve(result);}else keep.push(waiter);}publishWaiters=keep;}
  async function runPublishLoop(){
    if(publishLoopPromise)return await publishLoopPromise;
    publishLoopPromise=(async()=>{
      let lastResult=null;
      while(publishCompleted<publishRequested){
        if(!canPublish())break;
        const target=publishRequested,state=publishState||stateGetter?.();
        if(!state){publishCompleted=target;lastResult={blocked:true,code:'STATE_UNAVAILABLE',message:'Estado indisponível para publicar.'};settlePublishWaiters(target,lastResult,null);continue;}
        try{lastResult=await publishOnce(state);publishCompleted=target;settlePublishWaiters(target,lastResult,null);}
        catch(error){publishCompleted=target;settlePublishWaiters(target,null,error);throw error;}
      }
      return lastResult;
    })().finally(()=>{publishLoopPromise=null;if(canPublish()&&publishCompleted<publishRequested)runPublishLoop().catch(e=>console.warn('[BORION_INTEROP_SOURCE] Falha ao republicar:',e));});
    return await publishLoopPromise;
  }
  function requestPublish(state,{delay=0}={}){
    if(!state)return Promise.resolve({blocked:true,code:'STATE_UNAVAILABLE',message:'Estado indisponível para publicar.'});
    if(!canPublish())return Promise.resolve({blocked:true,code:'INITIAL_SYNC_REQUIRED',message:runtime.reason});
    publishState=state;const seq=++publishRequested;
    const promise=new Promise((resolve,reject)=>publishWaiters.push({seq,resolve,reject}));
    clearTimeout(timer);
    if(delay>0)timer=setTimeout(()=>runPublishLoop().catch(e=>console.warn('[BORION_INTEROP_SOURCE] Falha ao publicar:',e)),delay);else runPublishLoop().catch(()=>{});
    return promise;
  }
  function prepareState(state){return reconcileState(state||(stateGetter&&stateGetter()));}
  async function publish(state,options={}){return await requestPublish(state,{delay:0,forceAfterValidation:!!options.forceAfterValidation});}
  function schedule(state,delay=140){if(!state||!canPublish())return false;publishState=state;++publishRequested;clearTimeout(timer);timer=setTimeout(()=>runPublishLoop().catch(e=>console.warn('[BORION_INTEROP_SOURCE] Falha ao publicar:',e)),delay);return true;}
  function start(getter){if(typeof getter==='function')stateGetter=getter;if(runtime.started)return getRuntimeStatus();runtime.started=true;runtime.status='waiting-authentication';runtime.reason='Aguardando autenticação e carga da base oficial.';const tick=()=>{const state=stateGetter?stateGetter():null;if(state&&canPublish())schedule(state,20);};interval=setInterval(tick,5000);if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});if(typeof window!=='undefined'&&window.addEventListener){window.addEventListener('online',tick);window.addEventListener('pagehide',tick);}return getRuntimeStatus();}
  function stop(){clearTimeout(timer);clearInterval(interval);runtime.started=false;runtime.ready=false;runtime.initialSyncComplete=false;runtime.status='stopped';runtime.reason='Integração parada.';publishRequested=publishCompleted=0;publishState=null;publishWaiters=[];}

  window.MarcoBorionInterop=Object.freeze({spec:SPEC,start,stop,schedule,publish,prepareState,setReady,setNotReady,pause,resume,getRuntimeStatus,
    forceSync:state=>publish(state||(stateGetter&&stateGetter()),{forceAfterValidation:canPublish()}),getStatus(state){return clone(ensureBridgeState(state||(stateGetter&&stateGetter())));},
    __test:{hash,stableStringify,isBridgeExcluded,projectRecord,projectRecords,reconcileState,applyAcknowledgement,statusCode,paymentMethodLabel,validateCandidateAgainstRemote,ensureBridgeState,getDeviceId,canPublish,setReady,setNotReady,pause,resume,getRuntimeStatus,countSourceRecords,runPublishLoop,requestPublish,publishOnce}
  });
})();
