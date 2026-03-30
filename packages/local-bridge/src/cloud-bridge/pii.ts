/**
 * PII Dehydration/Rehydration Engine
 *
 * Port of the LOG.ai PII engine for cocapn.
 * Detects and replaces personally identifiable information with entity tokens.
 *
 * Entity format: [TYPE_COUNT] e.g., [EMAIL_1], [PHONE_2]
 *
 * Supported PII types:
 * - Email addresses
 * - Phone numbers (US and international)
 * - Social Security Numbers
 * - Credit card numbers
 * - Physical addresses (US)
 * - IP addresses
 * - Dates of birth
 * - Passport numbers
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PIIEntity {
  type: string;
  value: string;
  token: string;
  start: number;
  end: number;
}

export interface DehydratedText {
  text: string;
  entities: PIIEntity[];
}

// ─── PII Patterns ─────────────────────────────────────────────────────────────

// Email: standard format with optional +tag
const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+(?:\+[A-Za-z0-9._%+-]+)?@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// Phone: US (XXX) XXX-XXXX or XXX-XXX-XXXX, international with +country code
const PHONE_PATTERN = /(?:\+?(\d{1,3}))?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?:\s?(?:ext|x)\s?\d{1,5})?/g;

// SSN: XXX-XX-XXXX or XXX XX XXXX
const SSN_PATTERN = /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g;

// Credit card: 13-19 digits with spaces/dashes (all major card formats)
const CC_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;

// IPv4 address
const IPV4_PATTERN = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;

// IPv6 address (simplified)
const IPV6_PATTERN = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g;

// Date of birth: various formats (MM/DD/YYYY, DD-MM-YYYY, etc.)
const DOB_PATTERN = /\b(?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12][0-9]|3[01])[-/.](?:19|20)\d{2}\b/g;

// US Passport: 9 digits (often with leading zeros)
const PASSPORT_PATTERN = /\b[Pp]assport\s*[:#]?\s*\d{9}\b|\b\d{9}\s*(?:US\s*[Pp]assport|[Pp]assport\s*US)\b/gi;

// US Address: simplified pattern for street, city, state, zip
const ADDRESS_PATTERN = /\b\d+\s+[A-Za-z0-9\s.,#]+,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?\b/g;

// ─── Detection ─────────────────────────────────────────────────────────────────

/**
 * Detect PII in text and return all found entities
 */
function detectPII(text: string): PIIEntity[] {
  const entities: PIIEntity[] = [];

  // Helper to add matches for a pattern
  const addMatches = (pattern: RegExp, type: string): void => {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      if (match.index !== undefined) {
        entities.push({
          type,
          value: match[0],
          token: '', // Will be assigned during dehydration
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }
  };

  addMatches(EMAIL_PATTERN, 'EMAIL');
  addMatches(PHONE_PATTERN, 'PHONE');
  addMatches(SSN_PATTERN, 'SSN');
  addMatches(CC_PATTERN, 'CREDIT_CARD');
  addMatches(IPV4_PATTERN, 'IPV4');
  addMatches(IPV6_PATTERN, 'IPV6');
  addMatches(DOB_PATTERN, 'DOB');
  addMatches(PASSPORT_PATTERN, 'PASSPORT');
  addMatches(ADDRESS_PATTERN, 'ADDRESS');

  // Sort by start position (descending) to avoid offset issues during replacement
  return entities.sort((a, b) => b.start - a.start);
}

// ─── Dehydrate ────────────────────────────────────────────────────────────────

/**
 * Dehydrate PII from text, replacing with entity tokens
 * Returns the dehydrated text and list of entities
 */
export function dehydrate(text: string): DehydratedText {
  const entities = detectPII(text);

  // Count entities by type for token numbering
  const typeCount = new Map<string, number>();

  // Build dehydrated text from right to left (sorted by start position)
  let result = text;

  for (const entity of entities) {
    const count = typeCount.get(entity.type) || 0;
    typeCount.set(entity.type, count + 1);

    entity.token = `[${entity.type}_${count + 1}]`;

    // Replace the entity with its token
    result =
      result.slice(0, entity.start) + entity.token + result.slice(entity.end);
  }

  return { text: result, entities };
}

// ─── Rehydrate ────────────────────────────────────────────────────────────────

/**
 * Rehydrate PII by replacing entity tokens with original values
 * Accepts either the entities array from dehydrate() or falls back to token format
 */
export function rehydrate(
  text: string,
  entities?: PIIEntity[]
): string {
  if (!entities) {
    // Fallback: basic token replacement without values (tokens remain in place)
    return text;
  }

  let result = text;

  // Create a lookup map from token to value
  const tokenMap = new Map<string, string>();
  for (const entity of entities) {
    tokenMap.set(entity.token, entity.value);
  }

  // Replace all tokens with their original values
  for (const [token, value] of tokenMap.entries()) {
    result = result.replace(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }

  return result;
}

// ─── Validation ────────────────────────────────────────────────────────────────

/**
 * Check if a credit card number passes Luhn algorithm
 */
export function validateCreditCard(number: string): boolean {
  const digits = number.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
}

/**
 * Check if an SSN is valid (format only, not real validation)
 */
export function validateSSN(ssn: string): boolean {
  const cleaned = ssn.replace(/\D/g, '');
  return cleaned.length === 9 && !/^000/.test(cleaned) && !/^666/.test(cleaned);
}

/**
 * Check if an email address is valid (basic format check)
 */
export function validateEmail(email: string): boolean {
  const pattern = /^[A-Za-z0-9._%+-]+(?:\+[A-Za-z0-9._%+-]+)?@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$/;
  return pattern.test(email);
}
