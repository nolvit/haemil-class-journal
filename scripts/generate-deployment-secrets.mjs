import { randomBytes, scryptSync } from "node:crypto";
import webPush from "web-push";

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error(
    "사용법: node scripts/generate-deployment-secrets.mjs <12자-이상-관리자-비밀번호>"
  );
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
const vapid = webPush.generateVAPIDKeys();

console.log(`JWT_SECRET=${randomBytes(48).toString("base64url")}`);
console.log(
  `ADMIN_PASSWORD_HASH=${salt.toString("hex")}:${hash.toString("hex")}`
);
console.log(`VAPID_PUBLIC_KEY=${vapid.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapid.privateKey}`);
