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

  function promptNewPassword(appName) {
    for (;;) {
      const password = window.prompt(`${appName}\n\nCrie uma senha mestra exclusiva com pelo menos ${MIN_PASSWORD} caracteres. Ela protege os dados antes de sairem deste dispositivo.`);
      if (password === null) fail('SECURE_VAULT_SETUP_CANCELLED');
      if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
        window.alert(`A senha mestra precisa ter entre ${MIN_PASSWORD} e ${MAX_PASSWORD} caracteres.`);
        continue;
      }
      const confirmation = window.prompt(`${appName}\n\nDigite novamente a mesma senha mestra para confirmar.`);
      if (confirmation === null) fail('SECURE_VAULT_SETUP_CANCELLED');
      if (password !== confirmation) {
        window.alert('As senhas nao conferem. Tente novamente.');
        continue;
      }
      return password;
    }
  }

  function downloadRecovery(appName, appId, recoveryCode) {
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
    window.alert(`${appName}\n\nA criptografia foi ativada. Uma chave de recuperacao foi baixada.\n\n${recoveryCode}\n\nGuarde-a fora deste computador e fora do Drive do aplicativo.`);
  }

  function createContext(options) {
    const appId = String(options?.appId || '').trim();
    const appName = String(options?.appName || appId || 'Aplicativo').trim();
    const isSensitive = typeof options?.isSensitive === 'function' ? options.isSensitive : (() => true);
    if (!appId) fail('SECURE_VAULT_INVALID_APP');
    if (contexts.has(appId)) return contexts.get(appId);

    let ownerId = '';
    let ownerBinding = '';
    let key = null;
    let template = null;
    let plaintextMigrationPending = false;
    let queue = Promise.resolve();

    async function bindOwner(value) {
      ownerId = String(value || '').trim();
      if (!ownerId) fail('SECURE_VAULT_OWNER_REQUIRED');
      ownerBinding = await sha256Text(`${FORMAT}|${appId}|OWNER|${ownerId}`);
      if (template && template.ownerBinding !== ownerBinding) {
        key = null;
        template = null;
        plaintextMigrationPending = false;
        fail('SECURE_VAULT_WRONG_OWNER');
      }
      return ownerBinding;
    }

    async function createEnvelope(value) {
      if (!ownerBinding) fail('SECURE_VAULT_OWNER_REQUIRED');
      const password = promptNewPassword(appName);
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
        recovery: { ...recoveryWrap, createdAt: new Date().toISOString() },
        cipher: { name: 'AES-GCM', length: 256, tagLength: 128 },
        revision: 0,
        createdAt: new Date().toISOString()
      };
      const envelope = await updateEnvelope(value);
      downloadRecovery(appName, appId, recoveryCode);
      if (
        !readBiometricRecord(appId, vaultId)
        && await biometricPlatformAvailable()
        && window.confirm(`${appName}\n\nDeseja ativar a biometria neste celular para os proximos acessos?`)
      ) {
        try {
          await enrollBiometric(appId, appName, vaultId, password, ownerId);
          window.alert('Biometria ativada neste dispositivo.');
        } catch (error) {
          console.warn('[SecureJsonVault] A biometria nao foi ativada; a senha mestra continua disponivel:', error);
          window.alert('Este navegador nao concluiu a ativacao da biometria. A senha mestra continuara funcionando normalmente.');
        }
      }
      return envelope;
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
      if (readBiometricRecord(appId, envelope.vaultId)) {
        try {
          const biometricDek = await unlockWithBiometric(appId, envelope);
          if (biometricDek) return biometricDek;
        } catch (error) {
          console.warn('[SecureJsonVault] Biometria cancelada ou indisponivel; solicitando a senha mestra:', error);
        }
      }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const password = window.prompt(`${appName}\n\nDigite sua senha mestra para descriptografar os dados.`);
        if (password === null) fail('SECURE_VAULT_UNLOCK_CANCELLED');
        try {
          const dek = await unwrapDek(envelope, password, 'password');
          if (
            !readBiometricRecord(appId, envelope.vaultId)
            && await biometricPlatformAvailable()
            && window.confirm(`${appName}\n\nDeseja ativar a biometria neste celular para os proximos acessos?`)
          ) {
            try {
              await enrollBiometric(appId, appName, envelope.vaultId, password, ownerId);
              window.alert('Biometria ativada neste dispositivo.');
            } catch (biometricError) {
              console.warn('[SecureJsonVault] A biometria nao foi ativada; a senha mestra continua disponivel:', biometricError);
            }
          }
          return dek;
        } catch (error) {
          if (error?.code && !['SECURE_VAULT_AUTHENTICATION_FAILED', 'SECURE_VAULT_INVALID_SECRET'].includes(error.code)) throw error;
          window.alert('Senha mestra incorreta.');
        }
      }
      if (!window.confirm('Deseja usar a chave de recuperacao deste aplicativo?')) fail('SECURE_VAULT_LOCKED');
      const recovery = window.prompt(`${appName}\n\nDigite a chave de recuperacao.`);
      if (recovery === null) fail('SECURE_VAULT_UNLOCK_CANCELLED');
      const canonical = canonicalRecoveryCode(recovery);
      if (canonical.length !== RECOVERY_LENGTH) fail('SECURE_VAULT_INVALID_RECOVERY');
      const dek = await unwrapDek(envelope, canonical, 'recovery');
      await decryptEnvelope(envelope, dek);
      return dek;
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
      if (!key || !template || template.vaultId !== value.vaultId) key = await requestUnlock(value);
      const plain = await decryptEnvelope(value, key);
      if (!template || template.vaultId !== value.vaultId || Number(value.revision) >= Number(template.revision || 0)) {
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

    function lock() {
      key = null;
      template = null;
      plaintextMigrationPending = false;
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
      needsMigration: () => plaintextMigrationPending,
      markMigrated: () => { plaintextMigrationPending = false; },
      lock,
      status: () => ({ appId, ownerBound: !!ownerBinding, unlocked: !!key, migrationPending: plaintextMigrationPending, vaultId: template?.vaultId || '', revision: Number(template?.revision || 0) })
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
