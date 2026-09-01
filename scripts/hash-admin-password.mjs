import { randomBytes, scryptSync } from "node:crypto";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString("utf8").replace(/[\r\n]+$/, "");

if (password.length < 12) {
  console.error("관리자 비밀번호는 12자 이상이어야 합니다.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
process.stdout.write(`${salt.toString("hex")}:${hash.toString("hex")}`);
