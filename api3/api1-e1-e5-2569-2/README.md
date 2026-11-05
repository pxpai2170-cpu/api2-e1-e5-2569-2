# BPES-App Training Full

ระบบประเมินผลการปฏิบัติงานเบื้องต้น (Basic Performance Evaluation System: BPES) สำหรับใช้เรียนรู้การพัฒนา Backend ด้วย Node.js, Express, MySQL และ JWT โดยรวม API ทั้งหมดไว้ในไฟล์ `index.js`

## ความสามารถของระบบ

- เข้าสู่ระบบและตรวจสอบตัวตนด้วย JWT
- กำหนดสิทธิ์ผู้ใช้งาน 3 บทบาท: `admin`, `evaluator` และ `evaluatee`
- ผู้ดูแลระบบจัดการผู้ใช้งานและหัวข้อประเมิน
- ผู้รับการประเมินบันทึกคะแนนประเมินตนเองและ URL หลักฐาน
- กรรมการบันทึกคะแนน ให้ข้อเสนอแนะ และยืนยันผล
- ผู้ดูแลระบบและกรรมการดูรายงานผลรวมรายปี

## เทคโนโลยีที่ใช้

- Node.js และ Express 4
- MySQL 8 หรือเวอร์ชันที่รองรับ `utf8mb4`
- `mysql2` สำหรับเชื่อมต่อฐานข้อมูล
- `jsonwebtoken` สำหรับ JWT
- `bcryptjs` สำหรับเข้ารหัสและตรวจสอบรหัสผ่าน
- Jest และ Supertest สำหรับการทดสอบ

## โครงสร้างโปรเจกต์

```text
.
├── index.js          # Backend และ API ทั้งหมด
├── api_test.http     # ชุดคำขอสำหรับทดสอบ API ด้วย REST Client
├── package.json      # รายการแพ็กเกจและคำสั่งของโปรเจกต์
├── package-lock.json
├── .env              # ค่าการเชื่อมต่อฐานข้อมูลและ JWT (ไม่ควรเผยแพร่)
└── backup/           # โค้ดและไฟล์ทดสอบเวอร์ชันเดิม
```

> หมายเหตุ: โค้ดเตรียมรองรับหน้าเว็บในโฟลเดอร์ `public/` แต่ในชุดไฟล์ปัจจุบันไม่มีโฟลเดอร์ดังกล่าว จึงควรใช้งานและทดสอบในรูปแบบ REST API ผ่าน `api_test.http`, Postman หรือโปรแกรมประเภทเดียวกัน

## สิ่งที่ต้องติดตั้งก่อนเริ่มต้น

1. Node.js รุ่น LTS (แนะนำ Node.js 18 ขึ้นไป)
2. MySQL Server
3. Visual Studio Code
4. ส่วนขยาย **REST Client** ของ Huachao Mao หากต้องการใช้ไฟล์ `api_test.http`

ตรวจสอบว่า Node.js และ npm พร้อมใช้งาน:

```bash
node --version
npm --version
```

## การติดตั้ง

1. เปิด Terminal ที่โฟลเดอร์โปรเจกต์
2. ติดตั้งแพ็กเกจ:

```bash
npm install
```

3. เตรียมฐานข้อมูล MySQL ชื่อที่ตรงกับค่า `DB_NAME` ใน `.env` ฐานข้อมูลต้องมี 4 ตารางต่อไปนี้:

| ตาราง | หน้าที่ |
|---|---|
| `users` | เก็บบัญชีผู้ใช้งานและบทบาท |
| `criteria` | เก็บหัวข้อประเมิน |
| `evaluations` | เก็บคะแนนตนเอง คะแนนกรรมการ และหลักฐานรายหัวข้อ/รายปี |
| `evaluation_summaries` | เก็บผู้ยืนยันผล ข้อเสนอแนะ และเวลาที่ยืนยัน |

โครงสร้างที่โค้ดต้องใช้อย่างน้อย:

```sql
CREATE DATABASE IF NOT EXISTS bpes_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE bpes_db;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role ENUM('admin', 'evaluator', 'evaluatee') NOT NULL,
  department VARCHAR(255) NULL,
  position VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE criteria (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  weight DECIMAL(10,2) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE evaluations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evaluatee_id INT UNSIGNED NOT NULL,
  criterion_id INT UNSIGNED NOT NULL,
  eval_year INT NOT NULL,
  self_score TINYINT UNSIGNED NULL,
  evidence_url TEXT NULL,
  evaluator_score TINYINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_evaluation (evaluatee_id, criterion_id, eval_year),
  CONSTRAINT fk_evaluation_evaluatee
    FOREIGN KEY (evaluatee_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_evaluation_criterion
    FOREIGN KEY (criterion_id) REFERENCES criteria(id) ON DELETE CASCADE
);

CREATE TABLE evaluation_summaries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  evaluatee_id INT UNSIGNED NOT NULL,
  evaluator_id INT UNSIGNED NOT NULL,
  eval_year INT NOT NULL,
  overall_feedback TEXT NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_evaluation_summary (evaluatee_id, eval_year),
  CONSTRAINT fk_summary_evaluatee
    FOREIGN KEY (evaluatee_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_summary_evaluator
    FOREIGN KEY (evaluator_id) REFERENCES users(id) ON DELETE RESTRICT
);
```

4. เพิ่มบัญชี `admin` เริ่มต้นในตาราง `users` โดยค่าคอลัมน์ `password` ต้องเป็น bcrypt hash ไม่ใช่รหัสผ่านแบบข้อความธรรมดา สามารถสร้าง hash ตัวอย่างได้ด้วยคำสั่ง:

```bash
node -e "require('bcryptjs').hash('admin1234', 10).then(console.log)"
```

นำผลลัพธ์ที่ได้ไปแทนค่า `<BCRYPT_HASH>`:

```sql
INSERT INTO users (username, password, full_name, role, department, position)
VALUES ('admin', '<BCRYPT_HASH>', 'ผู้ดูแลระบบ', 'admin', 'ฝ่ายบุคลากร', 'ผู้ดูแลระบบ');
```

หลังจากเข้าสู่ระบบด้วย `admin` แล้ว ให้สร้างบัญชีกรรมการและผู้รับการประเมินผ่าน `POST /api/users` เพื่อให้ระบบเข้ารหัสรหัสผ่านให้อัตโนมัติ

## การตั้งค่า `.env`

สร้างหรือแก้ไขไฟล์ `.env` ที่โฟลเดอร์หลักของโปรเจกต์:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=bpes_db
PORT=7002
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1h
```

ข้อแนะนำ:

- เปลี่ยน `JWT_SECRET` เป็นข้อความสุ่มที่ยาวและคาดเดายาก โดยเฉพาะเมื่อนำระบบไปใช้งานจริง
- อย่า commit หรือส่งต่อไฟล์ `.env` เพราะมีข้อมูลสำคัญ
- ค่าเริ่มต้นของพอร์ตคือ `7002`

## การเปิดระบบ

โหมดใช้งานปกติ:

```bash
npm start
```

โหมดพัฒนา ซึ่งจะเริ่มใหม่เมื่อแก้ไขไฟล์:

```bash
npm run dev
```

เมื่อเริ่มทำงานสำเร็จ Terminal จะแสดงข้อความลักษณะนี้:

```text
เชื่อมต่อ MySQL สำเร็จ
BPES-App (Basic Backend — Single File) → http://localhost:7002
```

หากเชื่อมต่อฐานข้อมูลไม่ได้ โปรแกรมจะหยุดทำงาน ให้ตรวจสอบว่า MySQL เปิดอยู่ และค่าทั้งหมดใน `.env` ถูกต้อง

## วิธีทดสอบด้วย `api_test.http`

1. เปิดระบบด้วย `npm start`
2. เปิดไฟล์ `api_test.http` ใน Visual Studio Code
3. ตรวจสอบค่าด้านบนของไฟล์:

```http
@baseUrl = http://localhost:7002
@year = 2026
```

4. แก้ `@year` ให้เป็นปี ค.ศ. ที่ต้องการประเมิน
5. กด **Send Request** ที่คำขอเข้าสู่ระบบของบทบาทที่ต้องการก่อน
6. รันคำขออื่นตามลำดับจากบนลงล่าง เพราะ token ในไฟล์จะอ่านจากผลการเข้าสู่ระบบ
7. ก่อนทดสอบคำขอแก้ไขหรือลบ ให้เปลี่ยนเลข `id` ใน URL ให้ตรงกับข้อมูลจริงที่ได้จากคำขอสร้างข้อมูล

บัญชีตัวอย่างที่ระบุในไฟล์ทดสอบคือ:

| Username | Password | บทบาท |
|---|---|---|
| `admin` | `admin1234` | ผู้ดูแลระบบ |
| `eval01` | `eval1234` | กรรมการ |
| `emp001` | `emp1234` | ผู้รับการประเมิน |
| `emp002` | `emp1234` | ผู้รับการประเมิน |

บัญชีเหล่านี้จะใช้ได้ต่อเมื่อมีข้อมูลตรงกันในฐานข้อมูล และรหัสผ่านถูกจัดเก็บเป็น bcrypt hash แล้วเท่านั้น

## ลำดับการใช้งานระบบ

### 1. ผู้ดูแลระบบ (`admin`)

1. เข้าสู่ระบบที่ `POST /api/auth/login`
2. สร้างบัญชีกรรมการและผู้รับการประเมินที่ `POST /api/users`
3. เพิ่มหรือแก้ไขหัวข้อการประเมินที่ `/api/criteria`
4. ตรวจสอบความคืบหน้าที่ `GET /api/evaluations/evaluatees`
5. ดูรายงานรวมที่ `GET /api/report?year=2026`

### 2. ผู้รับการประเมิน (`evaluatee`)

1. เข้าสู่ระบบและนำ token ไปใช้แบบ Bearer Token
2. เปิดแบบประเมินของตนเองที่ `GET /api/evaluations/me?year=2026`
3. บันทึกคะแนนตนเองทีละหัวข้อที่ `PUT /api/evaluations/me`
4. แนบ URL หลักฐานใน `evidence_url` ได้
5. ดูข้อเสนอแนะหลังกรรมการยืนยันผลที่ `GET /api/evaluations/me/summary?year=2026`

ตัวอย่างการบันทึกคะแนนตนเอง:

```http
PUT http://localhost:7002/api/evaluations/me
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "criterion_id": 1,
  "self_score": 3,
  "evidence_url": "https://example.com/evidence",
  "eval_year": 2026
}
```

### 3. กรรมการ (`evaluator`) หรือผู้ดูแลระบบ

1. ดูรายชื่อผู้รับการประเมินที่ `GET /api/evaluations/evaluatees?year=2026`
2. เปิดรายละเอียดรายบุคคลที่ `GET /api/evaluations/:evaluateeId?year=2026`
3. บันทึกคะแนนกรรมการทีละหัวข้อที่ `PUT /api/evaluations/:evaluateeId`
4. ให้คะแนนครบทุกหัวข้อ
5. ยืนยันผลและบันทึกข้อเสนอแนะที่ `POST /api/evaluations/:evaluateeId/submit`
6. ดูรายงานรวมที่ `GET /api/report?year=2026`

ตัวอย่างการบันทึกคะแนนกรรมการ:

```http
PUT http://localhost:7002/api/evaluations/3
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "criterion_id": 1,
  "evaluator_score": 4,
  "eval_year": 2026
}
```

ตัวอย่างการยืนยันผล:

```http
POST http://localhost:7002/api/evaluations/3/submit
Authorization: Bearer <TOKEN>
Content-Type: application/json

{
  "overall_feedback": "ปฏิบัติงานได้ดีและควรรักษามาตรฐานต่อไป",
  "eval_year": 2026
}
```

## สรุป API และสิทธิ์

ทุก endpoint ยกเว้น `POST /api/auth/login` ต้องส่ง header ดังนี้:

```http
Authorization: Bearer <TOKEN>
```

| Method | Endpoint | สิทธิ์ | รายละเอียด |
|---|---|---|---|
| POST | `/api/auth/login` | ทุกคน | เข้าสู่ระบบและรับ token |
| GET | `/api/auth/me` | ผู้ที่เข้าสู่ระบบ | ดูข้อมูลจาก token |
| GET | `/api/users` | admin | ดูรายชื่อผู้ใช้ที่ไม่ใช่ admin |
| POST | `/api/users` | admin | เพิ่มผู้ใช้ |
| PUT | `/api/users/:id` | admin | แก้ไขผู้ใช้ |
| DELETE | `/api/users/:id` | admin | ลบผู้ใช้ |
| GET | `/api/criteria` | ผู้ที่เข้าสู่ระบบ | ดูหัวข้อประเมิน |
| POST | `/api/criteria` | admin | เพิ่มหัวข้อประเมิน |
| PUT | `/api/criteria/:id` | admin | แก้ไขหัวข้อประเมิน |
| DELETE | `/api/criteria/:id` | admin | ลบหัวข้อประเมิน |
| GET | `/api/evaluations/me` | evaluatee | ดูแบบประเมินตนเอง |
| PUT | `/api/evaluations/me` | evaluatee | บันทึกคะแนนตนเอง |
| GET | `/api/evaluations/me/summary` | evaluatee | ดูข้อเสนอแนะและสถานะส่งผล |
| GET | `/api/evaluations/evaluatees` | evaluator, admin | ดูรายชื่อและความคืบหน้า |
| GET | `/api/evaluations/:evaluateeId` | evaluator, admin | ดูรายละเอียดรายบุคคล |
| PUT | `/api/evaluations/:evaluateeId` | evaluator, admin | บันทึกคะแนนกรรมการ |
| POST | `/api/evaluations/:evaluateeId/submit` | evaluator, admin | ยืนยันผลการประเมิน |
| GET | `/api/report` | evaluator, admin | ดูรายงานรวม |

## หลักเกณฑ์การให้คะแนน

- คะแนนต่อหัวข้อต้องเป็นจำนวนเต็ม `1-4`
- ทุกหัวข้อมีน้ำหนักคงที่เท่ากับ `1` แม้ส่งค่า `weight` ตอนเพิ่มหรือแก้ไข ระบบจะไม่ใช้ค่านั้น
- รายงานคำนวณเปอร์เซ็นต์จากค่าเฉลี่ยคะแนนกรรมการเทียบกับคะแนนสูงสุด 4 คะแนน

| เปอร์เซ็นต์ | ผลประเมิน |
|---:|---|
| 90-100 | ดีเยี่ยม |
| 75-89.9 | ดี |
| 60-74.9 | ผ่าน |
| ต่ำกว่า 60 | ไม่ผ่าน |
| ยังไม่มีคะแนนกรรมการ | ยังไม่ประเมิน |

## ข้อควรทราบ

- ปีประเมินใช้ **ปี ค.ศ.** เช่น `2026` ไม่ใช่ปี พ.ศ. หากไม่ส่ง `year` หรือ `eval_year` ระบบจะใช้ปี ค.ศ. ปัจจุบันจากเครื่องเซิร์ฟเวอร์
- การบันทึกคะแนนเป็นแบบ UPSERT: ถ้ายังไม่มีข้อมูลจะสร้างใหม่ ถ้ามีข้อมูลหัวข้อ/บุคคล/ปีเดียวกันจะอัปเดตข้อมูลเดิม
- กรรมการต้องให้คะแนนครบทุกหัวข้อก่อนจึงจะยืนยันผลได้
- การลบผู้ใช้หรือหัวข้อที่มีข้อมูลประเมินสัมพันธ์กันอาจลบข้อมูลประเมินตามไปด้วย หากฐานข้อมูลสร้างด้วย Foreign Key ตัวอย่างข้างต้น
- ระบบตั้งค่า CORS ให้รับคำขอจากทุก origin เหมาะสำหรับการเรียนรู้ แต่ควรจำกัด origin เมื่อนำไปใช้งานจริง
- หากไม่มี `public/index.html` การเปิด `http://localhost:7002` โดยตรงจะไม่แสดงหน้าเว็บ แต่ endpoint `/api/...` ยังใช้งานได้ตามปกติ

## การตรวจสอบและแก้ปัญหาเบื้องต้น

### เปิดระบบแล้วขึ้นว่าเชื่อมต่อ MySQL ไม่ได้

- ตรวจสอบว่า MySQL Server กำลังทำงาน
- ตรวจสอบ `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` และ `DB_NAME`
- ตรวจสอบว่าผู้ใช้ MySQL มีสิทธิ์เข้าถึงฐานข้อมูล

### เข้าสู่ระบบไม่ได้

- ตรวจสอบว่ามี username ในตาราง `users`
- ตรวจสอบว่ารหัสผ่านในฐานข้อมูลเป็น bcrypt hash
- ตรวจสอบว่าใช้รหัสผ่านต้นฉบับตรงกับ hash

### ได้สถานะ 401

- ต้องเข้าสู่ระบบก่อนและส่ง `Authorization: Bearer <TOKEN>`
- token อาจหมดอายุ ให้เข้าสู่ระบบใหม่

### ได้สถานะ 403

- บัญชีที่ใช้ไม่มีสิทธิ์สำหรับ endpoint นั้น ให้ตรวจสอบคอลัมน์ `role`

### ยืนยันผลไม่ได้

- ตรวจสอบว่ากรรมการให้คะแนนครบทุกหัวข้อในปีเดียวกับที่กำลังยืนยัน
- ตรวจสอบว่า `eval_year` ในคำขอให้คะแนนและคำขอยืนยันเป็นค่าเดียวกัน

## คำสั่งที่ใช้บ่อย

```bash
npm install       # ติดตั้งแพ็กเกจ
npm start         # เปิดระบบ
npm run dev       # เปิดระบบแบบเฝ้าดูการแก้ไขไฟล์
npm test          # รันชุดทดสอบ Jest (เมื่อมีไฟล์ tests/*.test.js)
```

