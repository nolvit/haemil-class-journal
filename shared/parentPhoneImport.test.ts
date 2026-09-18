import { describe, expect, it } from "vitest";
import {
  buildParentPhoneImportPreview,
  extractStudentNameFromGuardianLabel,
  normalizePhone,
  parseParentPhoneContacts,
} from "./parentPhoneImport";

describe("parent phone VCF import", () => {
  it("extracts only exact guardian suffix labels", () => {
    expect(extractStudentNameFromGuardianLabel("김해밀 어머님")).toBe("김해밀");
    expect(extractStudentNameFromGuardianLabel("김해밀어머니")).toBe("김해밀");
    expect(extractStudentNameFromGuardianLabel("김해밀 엄마")).toBe("김해밀");
    expect(extractStudentNameFromGuardianLabel("김해밀어머님(구)")).toBeNull();
  });

  it("normalizes Korean phone numbers", () => {
    expect(normalizePhone("010-1234-5678")).toBe("01012345678");
    expect(normalizePhone("+82 10-1234-5678")).toBe("01012345678");
  });

  it("parses quoted-printable names and folded values", () => {
    const contacts = parseParentPhoneContacts(
      `BEGIN:VCARD\r\nVERSION:2.1\r\nFN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=EA=B9=80=ED=95=B4=\r\n=EB=B0=80=EC=96=B4=EB=A8=B8=EB=8B=98\r\nTEL;CELL:010-1234-5678\r\nEND:VCARD`
    );
    expect(contacts).toEqual([
      { label: "김해밀어머님", studentName: "김해밀", phones: ["01012345678"] },
    ]);
  });

  it("matches only empty, exact and unambiguous student records", () => {
    const preview = buildParentPhoneImportPreview(
      [
        {
          label: "김해밀어머님",
          studentName: "김해밀",
          phones: ["01011112222"],
        },
        {
          label: "박해나어머님",
          studentName: "박해나",
          phones: ["01022223333"],
        },
        {
          label: "박해나어머니",
          studentName: "박해나",
          phones: ["01099998888"],
        },
        { label: "최미르엄마", studentName: "최미르", phones: ["01033334444"] },
        {
          label: "없는학생어머님",
          studentName: "없는학생",
          phones: ["01055556666"],
        },
      ],
      [
        { id: 1, name: "김해밀", parentPhone: null },
        { id: 2, name: "박해나", parentPhone: null },
        { id: 3, name: "최미르", parentPhone: "01000000000" },
      ]
    );
    expect(preview.matches).toEqual([
      { studentId: 1, studentName: "김해밀", phone: "01011112222" },
    ]);
    expect(preview.ambiguous).toEqual(["박해나"]);
    expect(preview.alreadyRegistered).toEqual(["최미르"]);
    expect(preview.unmatched).toEqual(["없는학생"]);
  });
});
