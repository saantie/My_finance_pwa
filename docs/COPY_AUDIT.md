# Copy Audit — Tone & Voice Review

**Principle:** Observational, not judgmental. Describe what happened, not what the user should feel.

**Audit checklist per string:**
1. ❌ Implicit blame ("คุณใช้เกินไป")
2. ❌ Command/imperative ("ต้องบันทึก")
3. ❌ Failure language ("ผิด/ล้มเหลว/ไม่ครบ")
4. ❌ Unnecessary absolutes ("ทุกครั้ง/เสมอ/ห้าม")

---

## Changes Made

| File | Location | Before | After | Rule |
|------|----------|--------|-------|------|
| views.js | Forecast warning | `เงินจะใกล้เกณฑ์ในอีก N วัน — ลองลดรายจ่ายหรือเพิ่มรายรับ` | `ยอดใกล้เกณฑ์ในอีก N วัน` | #2 command removed |
| views.js | PDF password error | `รหัสผ่านไม่ถูกต้อง ลองใหม่อีกครั้ง` | `รหัสผ่านไม่ตรง — ลองใหม่` | #3 softer language |
| views.js | JSON import error | `ไฟล์ไม่ถูกต้อง` | `รูปแบบไฟล์ไม่รองรับ — ใช้ไฟล์ JSON ที่สำรองไว้` | #3 + actionable |
| views.js | Email validation | `รูปแบบอีเมลไม่ถูกต้อง` | `ตรวจสอบรูปแบบอีเมลอีกครั้ง` | #3 no "wrong" |
| views.js | Share auth guard | `ต้องลงชื่อเข้าใช้ก่อน` (×2) | `ลงชื่อเข้าใช้เพื่อแชร์บัญชี` / `…เพื่อจัดการบัญชีแชร์` | #2 imperative removed |
| views.js | Share add error | `เกิดข้อผิดพลาด: ${code}` | `แชร์ไม่สำเร็จ — ลองใหม่` | #3 no "ผิดพลาด" |
| views.js | Share remove error | `เกิดข้อผิดพลาด — ลองใหม่อีกครั้ง` | `ยกเลิกการแชร์ไม่สำเร็จ — ลองใหม่` | #3 specific action |
| views.js | Reject share error | `เกิดข้อผิดพลาด: ${code}` | `ปฏิเสธบัญชีไม่สำเร็จ — ลองใหม่` | #3 specific action |
| views.js | Sign-out error | `ออกจากระบบไม่สำเร็จ` | `ออกจากระบบไม่ได้ — ลองใหม่` | actionable |
| add.js | Voice network error | `ต้องต่อ internet` | `ต้องการ internet` | #2 less command-y |
| add.js | Voice generic error | `เกิดข้อผิดพลาด` | `ไม่สำเร็จ — ลองใหม่` | #3 no "ผิดพลาด" |
| add.js | Duplicate merge btn | `บันทึกแทน (ลบเดิม)` | `บันทึกแทนรายการเดิม` | #3 less destructive tone |
| views.js | Forecast note (ใต้กราฟ 30 วัน) | `รายการประจำ (exact) + ใช้จ่ายผันแปร X ฿/วัน − รายรับผันแปร… (หักรายการประจำออกแล้ว)` | `คาดจากการใช้เงินจริงของคุณช่วง N วันที่ผ่านมา — ปกติใช้จ่ายทั่วไปราววันละ X ฿ … บวกรายการประจำของคุณ (เช่น ค่าเช่า ผ่อน) ตามวันครบกำหนด` | jargon removed (exact / ผันแปร / วิธีคำนวณ) |

---

## Strings Reviewed & Kept (Already Good)

| File | String | Reason |
|------|--------|--------|
| views.js | `เดือนนี้คุณเหลือ / ใช้เกิน` | Observational fact, no exclamation |
| views.js | `ยอดต่ำกว่าเกณฑ์ (N ฿)` | States the threshold, no blame |
| views.js | `บันทึกแล้ว / แก้ไขแล้ว / ลบแล้ว` | Neutral past-tense confirmations |
| views.js | `🔥 ทำมาแล้ว N วัน` | Observational, past tense (not "don't break!") |
| views.js | `อีก N XP → Level X` | Encouraging fact, not demand |
| views.js | `Popup ถูกบล็อก — อนุญาต popup…` | Specific guidance, not blame |
| views.js | `ลงชื่อเข้าใช้สำเร็จ / ออกจากระบบแล้ว` | Neutral confirmations |
| add.js | `ใส่จำนวนเงินก่อน` | Gentle reminder, not scolding |
| add.js | `ไม่ได้ยินเสียง — ลองใหม่` | Describes state + offers action |
| add.js | `ไม่ได้รับสิทธิ์ใช้ไมค์` | Factual system state |

---

## Patterns to Avoid (Future PRs)

```
❌ เกิน + !  →  ✅ เกิน (no exclamation) or rephrase as amount
❌ ผิดพลาด   →  ✅ ไม่สำเร็จ
❌ ไม่ถูกต้อง →  ✅ ไม่ตรง / ไม่รองรับ / ตรวจสอบอีกครั้ง
❌ ต้อง [กริยา] →  ✅ [กริยา] เพื่อ [ผล]
❌ ลบเดิม    →  ✅ แทนรายการเดิม
❌ Don't break your streak! →  ✅ ไม่แจ้งเลย (silent)
❌ You spent too much on X →  ✅ อันดับ 1 เดือนนี้คือ X
❌ Over budget! →  ✅ ยอดใกล้เกณฑ์ในอีก N วัน
```

---

## PR Review Checklist

Before merging UI changes:
- [ ] ไม่มี "!" ต่อท้ายข้อความเตือน
- [ ] ข้อความ error บอกว่า **ทำอะไรต่อได้** ("ลองใหม่" / "ตรวจสอบ X")
- [ ] ไม่มี "คุณ" นำหน้าข้อความเชิงลบ ("คุณใช้เกิน")
- [ ] Streak miss / reset → silent (ไม่มี toast)
- [ ] Empty state มี CTA ที่เป็นบวก ไม่ใช่ "ยังไม่มีข้อมูล" เฉยๆ
- [ ] ภาษาเชิง past tense สำหรับ streak/level ("ทำมาแล้ว" ไม่ใช่ "ทำต่อไป")
