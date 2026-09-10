# Avatar collection boundary

- Keep class journal/attendance pages and their theme unchanged. Fantasy styles are scoped to .avatar-theme, avatar card components, and avatar lightboxes.
- Any new avatar artwork, collection card, reference, or administrator preview must open an accessible enlarged view. Provide zoom, keyboard close, touch scrolling, and reduced-motion support.
- Default frame: 월광의 서약. Default background: 별의 인장 (restrained patterns and borders). 달빛 서고 is a paid background, never the default.
- Frames and backgrounds are independent permanent purchases, server-priced at 300/750/1500P. Free defaults remain usable. Lock the account and write the purchase ledger atomically. Owned items never charge twice.
- Five navigation slots: collection, points, help, shop, gallery. Add future products as shop categories.
- Sharing defaults to private per collection card. Gallery requires existing student portal access. Image is required; name and grade are independently opt-in, masked by the server as 박00 / 중0학년 otherwise. Do not return raw student IDs, tokens, or hidden identity fields.
- One non-self first like per student/card pays its owner 10P, atomically with a permanent reward marker. Unlike changes the social count only; re-like does not earn again. Rewards appear in the ledger and lifetime.
- Use neutral fantasy creation language, without falsely claiming the backend generates images automatically.
- Source image pixels are preserved. Purchased backgrounds decorate card surroundings, not the artwork itself.
- Creation charges use the server-authoritative base tier plus Original 0P / Wannabe 100P / Superstar 200P. Refund the stored order charge, including legacy orders.
- Avatar entry/exit uses a bottom sheet. Internal pages switch without animation. The plaza circle-to-framed-card reveal is the deliberate exception. Browser back closes the avatar layer without leaving the journal.
- Zoom surfaces consume bounded pointer/wheel movement and suppress overscroll navigation. Restore document overscroll settings after closing.
- Plaza pages contain up to 36 circular previews. Enlarged previews and downloads include the equipped frame/background. Downloads are freshly encoded 900x1200 PNGs without UI identity fields or source metadata; original artwork pixels are retained.
- Seasonal administrator prompts cover Chuseok, Halloween and Christmas shell backgrounds, transparent frames, card backgrounds, slider tracks/fills/thumbs with explicit dimensions and safe regions.
- 2026-09-10 validation: 83 local unit/transaction tests and desktop/mobile browser regression passed. The user chose local-only validation; no new remote isolated-database QA payload was sent or executed.
