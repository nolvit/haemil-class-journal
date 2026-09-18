export type ParentPhoneContact = {
  label: string;
  studentName: string;
  phones: string[];
};

export type ParentPhoneStudent = {
  id: number;
  name: string;
  parentPhone: string | null;
};

export type ParentPhoneImportMatch = {
  studentId: number;
  studentName: string;
  phone: string;
};

export type ParentPhoneImportPreview = {
  matches: ParentPhoneImportMatch[];
  alreadyRegistered: string[];
  ambiguous: string[];
  unmatched: string[];
};

function decodeQuotedPrintable(value: string) {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (
      /^[0-9A-Fa-f]{2}$/.test(value.slice(index + 1, index + 3)) &&
      value[index] === "="
    ) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
      continue;
    }
    bytes.push(...Array.from(new TextEncoder().encode(value[index])));
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

function decodeVCardValue(key: string, value: string) {
  return /ENCODING=QUOTED-PRINTABLE/i.test(key)
    ? decodeQuotedPrintable(value)
    : value.replace(/\\([,;\\nN])/g, (_match, escaped: string) =>
        escaped.toLowerCase() === "n" ? "\n" : escaped
      );
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("82") && digits.length >= 11)
    return `0${digits.slice(2)}`;
  return digits;
}

export function extractStudentNameFromGuardianLabel(label: string) {
  const normalized = label.normalize("NFC").trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(.+?)\s*(?:어머님|어머니|엄마)$/);
  return match?.[1].trim() ?? null;
}

export function parseParentPhoneContacts(vcf: string): ParentPhoneContact[] {
  const normalized = vcf
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/=\n[ \t]?/g, "")
    .replace(/\n[ \t]+/g, "");
  const cards = normalized.split(/BEGIN:VCARD/i).slice(1);

  return cards.flatMap(card => {
    let label = "";
    const phones = new Set<string>();
    for (const line of card.split("\n")) {
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      const key = line.slice(0, separator);
      const value = line.slice(separator + 1).trim();
      if (/^FN(?:;|$)/i.test(key)) label = decodeVCardValue(key, value).trim();
      if (/^TEL(?:;|$)/i.test(key)) {
        const phone = normalizePhone(value);
        if (phone.length >= 9 && phone.length <= 12) phones.add(phone);
      }
    }
    const studentName = extractStudentNameFromGuardianLabel(label);
    return studentName && phones.size
      ? [{ label, studentName, phones: Array.from(phones) }]
      : [];
  });
}

export function buildParentPhoneImportPreview(
  contacts: ParentPhoneContact[],
  students: ParentPhoneStudent[]
): ParentPhoneImportPreview {
  const contactsByName = new Map<string, ParentPhoneContact[]>();
  for (const contact of contacts) {
    const current = contactsByName.get(contact.studentName) ?? [];
    current.push(contact);
    contactsByName.set(contact.studentName, current);
  }

  const studentNames = new Set(
    students.map(student => student.name.normalize("NFC").trim())
  );
  const matches: ParentPhoneImportMatch[] = [];
  const alreadyRegistered: string[] = [];
  const ambiguous: string[] = [];

  for (const student of students) {
    const studentName = student.name.normalize("NFC").trim();
    const candidates = contactsByName.get(studentName) ?? [];
    if (!candidates.length) continue;
    const phones = Array.from(
      new Set(candidates.flatMap(contact => contact.phones))
    );
    if (student.parentPhone?.trim()) {
      alreadyRegistered.push(student.name);
    } else if (candidates.length !== 1 || phones.length !== 1) {
      ambiguous.push(student.name);
    } else {
      matches.push({
        studentId: student.id,
        studentName: student.name,
        phone: phones[0],
      });
    }
  }

  const unmatched = Array.from(contactsByName.keys()).filter(
    name => !studentNames.has(name)
  );
  return { matches, alreadyRegistered, ambiguous, unmatched };
}
