# Avatar collection boundary

- Keep class journal/attendance pages and their theme unchanged. Fantasy styles are scoped to .avatar-theme, avatar card components, and avatar lightboxes.
- Any new avatar artwork, collection card, reference, or administrator preview must open an accessible enlarged view. Provide zoom, keyboard close, touch scrolling, and reduced-motion support.
- Default frame: 월광의 서약. Default background: 별의 인장 (restrained patterns and borders). 달빛 서고 is a paid background, never the default.
- Five navigation slots: collection, points, help, shop, gallery. Add future products as shop categories.
- Sharing defaults to private per collection card. Gallery requires existing student portal access. Image is required; name and grade are independently opt-in, masked by the server as 박00 / 중0학년 otherwise. Do not return raw student IDs, tokens, or hidden identity fields.
- One non-self first like per student/card pays its owner 10P, atomically with a permanent reward marker. Unlike changes the social count only; re-like does not earn again. Rewards appear in the ledger and lifetime.
- Use neutral fantasy creation language, without falsely claiming the backend generates images automatically.
- Source image pixels are preserved. Purchased backgrounds decorate card surroundings, not the artwork itself.
- Creation base tiers are 50/100/150/200P, fixed from the fourth attempt. Each selected part adds 10/15/20/30P and each accessory adds 5/10/15/15P by attempt. Wannabe adds 100P and Superstar 200P. Refund the stored order charge, including legacy orders.
- A single random action immediately charges 1/2/3/5P; a full-theme random action charges 10/20/30/50P. The first random action in an open session requires an explicit warning confirmation. All random charges are server-authoritative and request-idempotent.
- Random concepts are 25 coherent presets: five each for medieval Europe, Joseon, school look, fantasy and future. Administrator prompts require two visibly different candidate compositions.
- Frames and backgrounds belong to one collection card. Paid prices are 150/375/750P; legacy account inventory is copied to each existing card during the additive migration.
- Unsaved circular crop or zoom changes trigger a warning before leaving the collection page.
- Avatar entry/exit uses a bottom sheet. Internal pages switch without animation. The plaza circle-to-framed-card reveal is the deliberate exception. Browser back closes the avatar layer without leaving the journal.
- Zoom surfaces consume bounded pointer/wheel movement and suppress overscroll navigation. Restore document overscroll settings after closing.
- Plaza pages contain up to 36 circular previews. Enlarged previews and downloads include the equipped frame/background. Downloads are freshly encoded 900x1200 PNGs without UI identity fields or source metadata; original artwork pixels are retained.
- Seasonal administrator prompts cover Chuseok, Halloween and Christmas shell backgrounds, transparent frames, card backgrounds, slider tracks/fills/thumbs with explicit dimensions and safe regions.
- 2026-09-10 validation: 84 local unit/transaction tests and desktop/mobile browser regression passed. The user chose local-only validation; no new remote isolated-database QA payload was sent or executed.
