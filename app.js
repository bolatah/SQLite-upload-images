const express = require("express");
const app = express();
const port = 3003;
var fs = require("fs");
const cors = require("cors");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const sqlite3 = require("sqlite3"),
  TransactionDatabase = require("sqlite3-transactions").TransactionDatabase;

const DBSOURCE = "usersdb.sqlite";

const db = new TransactionDatabase(
  new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
      // Cannot open database
      console.error(err.message);
      throw err;
    } else {
      // ** EXAMPLE **
      // ** For a column with unique values **
      // email TEXT UNIQUE,
      // with CONSTRAINT email_unique UNIQUE (email)

      db.run(
        `CREATE TABLE Users (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,              
            Username TEXT,             
            DateModified DATE,
            DateCreated DATE
            )`,
        (err) => {
          if (err) {
            // Table already created
          } else {
            // Table just created, creating some rows
            const insert =
              "INSERT INTO Users (Username, DateCreated) VALUES (?,?)";
            db.run(insert, ["user1", Date("now")]);
            db.run(insert, ["user2", Date("now")]);
            db.run(insert, ["user3", Date("now")]);
            db.run(insert, ["user4", Date("now")]);
          }
        }
      );

      db.run(
        `CREATE TABLE UserImages (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            UserId INTEGER,                         
            Mimetype TEXT,                         
            Filename TEXT,                         
            Size INTEGER,                         
            DateModified DATE,
            DateCreated DATE
            )`,
        (err) => {
          if (err) {
            // Table already created
          }
        }
      );
    }
  })
);

module.exports = db;

app.use(
  express.json(),
  cors({
    origin: "http://localhost:3000",
  })
);

app.get("/", (req, res) => res.send("API Root"));

// G E T   A L L
app.get("/api/users", async (req, res, next) => {
  var sql = "SELECT * FROM Users";
  var params = [];
  db.all(sql, params, (err, rows) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.json({
      message: "success",
      data: rows,
    });
  });
});

// G E T   S I N G L E   U S E R
app.get("/api/user/:id", async (req, res, next) => {
  const sql = "SELECT * FROM Users WHERE Id = ?";
  db.all(sql, req.params.id, (err, rows) => {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.json({
      message: "success",
      data: rows,
    });
  });
});

// C R E A T E
app.post("/api/user", async (req, res) => {
  const errors = [];

  if (!req.body.Username) {
    errors.push("Username is missing");
  }

  // Just in case there are more fields missing
  if (errors.length) {
    res.status(400).json({ error: errors.join(",") });
    return;
  }

  const data = {
    Username: req.body.Username,
    DateCreated: Date("now"),
  };

  const sql = "INSERT INTO Users (Username, DateCreated) VALUES (?,?)";
  const params = [data.Username, Date("now")];

  db.run(sql, params, function (err, result) {
    if (err) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.json({
      message: "success",
      data: data,
      id: this.lastID,
    });
  });
});

// U P D A T E
app.patch("/api/user/:id", async (req, res) => {
  const errors = [];

  if (!req.body.Username) {
    errors.push("Username is missing");
  }

  // Just in case there are more fields missing
  if (errors.length) {
    res.status(400).json({ error: errors.join(",") });
    return;
  }

  const data = [req.body.Username, Date("now"), req.params.id];

  let sql = `UPDATE Users SET 
               Username = ?, 
               DateModified = ?
               WHERE Id = ?`;

  await db.run(sql, data, function (err) {
    if (err) {
      return console.error(err.message);
    }
    console.log(`Row(s) updated: ${this.changes}`);
  });

  res.json({
    message: "success",
    id: req.params.id,
    changes: this.changes,
  });
});

// D E L E T E
app.delete("/api/user/:id", async (req, res, next) => {
  db.beginTransaction(function (err, transaction) {
    // SELECT IMAGES FOR THIS RECORD - DELETE THE FILES & SUB DIRECTORY
    db.all(
      "SELECT Filename FROM UserImages WHERE UserId = ?",
      req.params.id,
      (err, rows) => {
        if (err) {
          res.status(400).json({ error: err.message });
          return;
        }

        // DELETE THE FILES FROM THE QUERY DATA (rows)
        rows.forEach((item) => {
          console.log(item.Name);
          var filePath = `./images/${req.params.id}/${item.Filename}`;

          console.log("filePath", filePath);
          try {
            fs.unlinkSync(filePath);
            //file removed
          } catch (err) {
            console.error(err);
          }
        });

        // REMOVE THE SUB DIRECTORY
        var dirPath = `./images/${req.params.id}`;
        fs.rmdir(dirPath, function (err) {
          if (err) {
            throw err;
          } else {
            console.log("Successfully removed the empty directory!");
          }
        });
      }
    );

    // DELETE IMAGE RECORDS
    db.run(
      "DELETE FROM UserImages WHERE UserId = ?",
      req.params.id,
      function (err, result) {
        if (err) {
          res.status(400).json({ error: res.message });
          return;
        }
      }
    );

    // DELETE PARENT RECORD
    db.run(
      "DELETE FROM Users WHERE id = ?",
      req.params.id,
      function (err, result) {
        if (err) {
          res.status(400).json({ error: res.message });
          return;
        }
      }
    );

    transaction.commit(function (err) {
      if (err) return console.log("Commit() failed.", err);
      //. console.log("Commit() was successful.");
    });
  });
  res.json({
    message: `Record and Images Deleted`,
  });
});

// uploading a single file
const upload = multer({ dest: "./images/" });

app.post(
  "/api/upload-single-file",
  upload.single("files"),
  function async(req, res) {
    let isUserExists = true;

    const sql = "SELECT * FROM Users WHERE Id = ?";

    db.all(sql, req.body.UserId, (err, rows) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }

      isUserExists = rows.length > 0 ? true : false;

      if (isUserExists) {
        const dir = `./images/${req.body.UserId}/`;

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const oldPath = `./images/${req.file.filename}`;
        const newPath = `./images/${req.body.UserId}/${req.file.filename}.jpg`;

        fs.rename(oldPath, newPath, function (err) {
          if (err) throw err;
          console.log("Successfully Moved File");
        });

        const data = {
          UserId: req.body.UserId,
          Name: req.file.filename,
          Mimetype: req.file.mimetype,
          Size: req.file.size,
          DateCreated: Date("now"),
        };

        const sql =
          "INSERT INTO UserImages (UserId, Filename, Mimetype, Size, DateCreated) VALUES (?,?,?,?,?)";
        const params = [
          data.UserId,
          data.Name,
          data.Mimetype,
          data.Size,
          Date("now"),
        ];

        db.run(sql, params, function (err, result) {
          if (err) {
            res.status(400).json({ error: err.message });
            return;
          }
        });

        res.status(200).json(req.file);
      } else {
        res.json({
          message: `Record does not exist`,
        });
      }
    });
  }
);

// uploading multiple files

const uploads = multer();

app.post(
  "/api/upload-multiple-files",
  uploads.array("files", 3),
  function async(req, res) {
    const file = req.files;
    const fileCount = 0;

    const isUserExists = true;

    const sql = "SELECT * FROM Users WHERE Id = ?";
    db.all(sql, req.body.UserId, (err, rows) => {
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }

      const isUserExists = rows.length > 0 ? true : false;

      if (isUserExists) {
        const dir = `./images/${req.body.UserId}/`;

        file.forEach((element) => {
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          const newFileName = `${uuidv4()}.jpg`;
          const newPath = `./images/${req.body.UserId}/${newFileName}`;
          const imageBinary = element.buffer;
          try {
            fs.writeFile(newPath, imageBinary, "base64", function (err) {});
          } catch (error) {
            console.log(error);
          }
          const data = {
            UserId: req.body.UserId,
            Filename: newFileName,
            Mimetype: element.mimetype,
            Size: element.size,
            DateCreated: Date("now"),
          };
          const sql =
            "INSERT INTO UserImages (UserId, Filename, Mimetype, Size, DateCreated) VALUES (?,?,?,?,?)";
          const params = [
            data.UserId,
            data.Filename,
            data.Mimetype,
            data.Size,
            Date("now"),
          ];

          db.run(sql, params, function (err, result) {
            if (err) {
              res.status(400).json({ error: err.message });
              return;
            }
          });
          fileCount++;
        });

        res.json({
          message: `Successfully uploaded ${fileCount} files`,
        });
      } else {
        res.json({
          message: `Record does not exist`,
        });
      }
    });
  }
);

app.listen(port, () => console.log(`API listening on port ${port}!`));
