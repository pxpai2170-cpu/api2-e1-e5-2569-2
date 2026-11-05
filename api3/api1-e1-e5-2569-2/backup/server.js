require("dotenv").config();
const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { pool } = require("./db");

// 1 Set up middleware to parse JSON request bodies
// - Database connection and JWT secret are configured in the .env file

app.use(express.json());
const PORT = process.env.PORT;

// 2. สร้าง middleware สำหรับตรวจสอบ JWT token

function adminOnly(req, res, next) {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).send({ status: "error", message: "Access denied. Admin only." });
  }
}

function evaluateeOnly(req, res, next) {
  if (req.user && req.user.role === "evaluatee") {
    next();
  } else {
    res.status(403).send({ status: "error", message: "Access denied. Evaluatee only." });
  }
}
function evaluatorOnly(req, res, next) {
  if (req.user && req.user.role === "evaluator") {
    next();
  } else {
    res.status(403).send({ status: "error", message: "Access denied. Evaluator only." });
  }
}


function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ status: "error", message: "Authorization token is missing" });
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ status: "error", message: "Invalid token" });
    }
    req.user = decoded;
    next();
  });
}
app.get("/api/auth/me", verifyToken, (req, res) => {
  res.send({
    status: "ok",
    message: "Authenticated user info",
    user: req.user
  });
});


// 3. สร้าง middleware สำหรับตรวจสอบ JWT token และสิทธิ์การเข้าถึง (role-based access control)


//

//4. LOGIN API 


app.post("/api/login", async (req, res) => {
  console.log("POST /api/login");
  console.log("Request Body:", req.body);
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).send({
      status: "error",
      message: "Missing username or password",
    });
  }
  //1. หาก username และ password ถูกต้อง (ตัวอย่างนี้ไม่ตรวจสอบจริง)
   const [rows] = await pool.execute("SELECT * FROM users WHERE username = ?", [username]);
  if (rows.length === 0) {
    return res.status(401).send({
      status: "error",
      message: "Invalid username ",
    });
  }
  const user = rows[0];
  //2. ตรวจสอบรหัสผ่าน (ตัวอย่างนี้ไม่ตรวจสอบจริง)
  const match = await bcrypt.compare(password, user.password);
  if (! match) {
    return res.status(401).send({
      status: "error",
      message: "Invalid password",
    });
  }
  //3. สร้าง JWT token
  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h",
  });
   console.log("Login successful, token:", token);
    return res.status(200).json({
        status: "ok",
        message: "Login successful",
        token: token,
    });
});
// ดูข้อมูลจาก Token
// app.get('/api/auth/me', verifyToken, function (req, res) {
//   return res.status(200).json({
//     status: 'success',
//     message: 'สำเร็จ',
//     data: req.user
//   });
// });



// 5. User API

// Admin  ดูรายชื่อผู้ใช้งานทั้งหมด

app.get("/api/listUsers", verifyToken, adminOnly, async (req, res) => {     
    console.log("GET /api/listUsers");
  try {
    const [rows] = await pool.execute("SELECT * FROM users");
    console.log("Fetched users:", rows);
    res.send({
      status: "ok",
      users: rows,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({ status: "error", message: "Internal Server Error" });
  }
});


// http://localhost:7005/api/listUsers/2

app.get("/api/listUsers/:id", async (req, res) => {
  const { id } = req.params;
  console.log("GET /api/listUsers/:id", id);
  try {
    const [rows] = await pool.execute("SELECT * FROM users WHERE id = ?", [id]);
    if (rows.length === 0) {
      return res
        .status(404)
        .send({ status: "error", message: "User not found" ,id: id });
    }
    res.send({ status: "ok", user: rows[0] });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).send({ status: "error", message: "Internal Server Error" });
  }
});

// Admin เพิ่มผู้ใช้งานใหม่
app.post("/api/addUser", verifyToken, adminOnly, async (req, res) => {
  console.log("POST /api/addUser");
  console.log("Request Body:", req.body);
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).send({
      status: "error",
      message: "Missing required fields"
    });
  } 
   const hashedPassword = await bcrypt.hash(password, 10);
   const [result] = await pool.execute(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
    [username, hashedPassword, role]
  );
  console.log("User added with ID:", result.insertId);
  res.send({
    status: "ok",
    message: "User added successfully",
    userId: result.insertId,
  });
});

// edit user
app.put("/api/editUser/:id", verifyToken, adminOnly, async (req, res) => {
  console.log("PUT /api/editUser/:id");
  console.log("Request Body:", req.body); 
  try {
    const { id } = req.params;
    const { username, password, role } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await pool.execute(
      "UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?",
      [username, hashedPassword, role, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).send({
        status: "error",
        message: "User not found"
      });
    }
    res.send({
      status: "ok",
      message: "User updated successfully"
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).send({
      status: "error",
      message: "Internal Server Error"
    });
  }
});
// delete user
app.delete("/api/deleteUser/:id", verifyToken, adminOnly, async (req, res) => {
  console.log("DELETE /api/deleteUser/:id");
  try {
    const { id } = req.params;
    const [result] = await pool.execute("DELETE FROM users WHERE id = ?", [id]);  

    if (result.affectedRows === 0) {
      return res.status(404).send({
        status: "error",
        message: "User not found"
      });
    }

    res.send({
      status: "ok",
      message: "User deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).send({
      status: "error",
      message: "Internal Server Error"
    });
  }
});

app.get("/api/listUsers", async (req, res) => {
  console.log("GET /api/listUsers");
  try {
    const [rows] = await pool.execute("SELECT * FROM users");
    console.log("Fetched users:", rows[0]);
    res.send({
      status: "ok",
      users: rows,
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({
      status: "error",
      message: "Internal Server Error",
    });
  }
});


// http://localhost:7005/api/list?name="kruoak
app.get("/api/list", (req, res) => {
  console.log("GET /api/list");
  console.log("Query Parameters:", req.query);
  const { name, age } = req.query;
  res.send({
    status: "ok",
    name: name,
    age: req.query.age || null,
  });
});

// 6. Critiria API


// 6.1ทุกคนที่ login  แล้วดูหัวข้อได้้  
app.get("/api/listCriteria", verifyToken, async (req, res) => {
  console.log("GET /api/listCriteria");
  try {
    const [rows] = await pool.execute("SELECT * FROM criteria");
    console.log("Fetched criteria:", rows);
    res.status(200).send({
      status: "ok",
      criteria: rows,
    });
  } catch (error) {
    console.error("Error fetching criteria:", error);
    res.status(500).send({ status: "error", message: "Internal Server Error" });
  }
  
});


// 6.2Admin  เพิ่มหัวข้อใหม่
app.post("/api/addCriteria", verifyToken, adminOnly, async (req, res) => {
  console.log("POST /api/addCriteria");
  console.log("Request Body:", req.body);
  const { name, description } = req.body;
  if (!name || !description) {
    return res.status(400).send({
      status: "error",
      message: "Missing required fields"
    });
  }
  try {
    const [result] = await pool.execute(
      "INSERT INTO criteria (name, description) VALUES (?, ?)",
      [name, description]
    );
    console.log("Criteria added with ID:", result.insertId);
    res.status(201).send({
      status: "ok",
      message: "Criteria added successfully",
      criteriaId: result.insertId,
    });
  } catch (error) {
    console.error("Error adding criteria:", error);
    res.status(500).send({ status: "error", message: "Internal Server Error" });
  }
});


// 7. Evaluation API   ผู้รับการประเมิน  สามารถดูผลการประเมินของตนเองได้


// 7.1 ผู้รับการประเมิน  สามารถดูผลการประเมินของตนเองได้




// 7.2 ผู้รับการประเมิน บันทึกผลการประเมินของตนเองได้
// ตรวจสอบคะแนนเดิม ถ้าไม่มีให้บันทึกใหม่ ถ้ามีแล้วให้แก้ไขคะแนนเดิม



// 8. Evaluation API   ผู้ประเมิน  สามารถดูผลการประเมินของผู้รับการประเมินได้
// 8.1 ผู้ประเมิน  ดูรายชื่อผู้รับการประเมินทั้งหมด

// 8.2 ผู้ประเมิน  ให้คะแนนผู้รับการประเมินได้


// 8.3 ตรวจสอบข้อมูลการประเมินของผู้รับการประเมิน  ถ้ามีแล้วให้แก้ไขคะแนนเดิม ถ้าไม่มีให้บันทึกใหม่



// 9  Start the server














app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
