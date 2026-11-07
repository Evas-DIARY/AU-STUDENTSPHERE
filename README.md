# AU StudentSphere
### University Student Profile Management System
**Africa University &bull; College of Engineering and Applied Sciences**

> **Institutional Attribution:** Developed by the College of Engineering and Applied Sciences, Africa University.

---

## 1. Project Overview

**AU StudentSphere** is a centralized, role-based University Student Profile Management System designed for Africa University. The platform bridges students, lecturers, and academic administrators into a unified, secure system:

1. **Students** maintain comprehensive digital profiles, track semester coursework grades, and submit extracurricular accomplishments (leadership positions, club participation, community service/volunteering, awards, hackathons, and certifications) with verifiable evidence.
2. **Lecturers** inspect assigned student profiles via a dynamic student profile switcher (seamlessly switching between demonstration student profiles without logging out), review authenticated vs. pending accomplishments, and generate formal recommendation letters with verified accomplishments and official university letterhead.
3. **Administrators** govern the **Achievement Verification Queue**, inspecting uploaded evidence documents to **Verify**, **Reject** (with required reason), or **Request Resubmission** (with instructions), maintaining an immutable audit trail and ensuring only authentic credentials are commemorated.

---

## 2. Demonstration Accounts & Login Credentials

All demonstration accounts are preloaded into the database with hashed passwords (`PBKDF2-SHA256`). A 1-click credential launchpad is also available on the landing page for quick review:

| Role | Name | Institutional Email / Username | Password | Key Profile Highlights |
|---|---|---|---|---|
| **Student** | **Ropafadzo Mwanza** | `ropafadzo.mwanza@africau.edu` | `Password123!` | B.Sc. CS (Honours), Year 3, GPA: 3.86 &bull; Dean's Award, WIT Chairperson, Hackathon Winner |
| **Student** | **Tanaka Dengende** | `tanaka.dengende@africau.edu` | `Password123!` | B.Sc. Software Engineering, Year 4, GPA: 3.92 &bull; GDSC Lead, AWS Solutions Architect, Innovation Prize |
| **Student** | **Tendesai Muyambo** | `tendesai.muyambo@africau.edu` | `Password123!` | B.Sc. IT & Network Security, Year 2, GPA: 3.74 &bull; CCNA Certified, Cyber Security Secretary |
| **Lecturer** | **Dr. Herbert Sibanda** | `herbert.sibanda@africau.edu` | `Password123!` | Senior Lecturer & Chair of Department, Computer Science & Information Systems |
| **Admin** | **Mrs. Chipo Rusike** | `chipo.rusike@africau.edu` | `Password123!` | Senior Assistant Registrar, CEAS Quality Assurance & Records Directorate |

---

## 3. Technology Stack & System Architecture

```text
AU-StudentSphere/
├── server.js                          # Node.js + Express REST API Server
├── package.json
├── database/
│   ├── db.js                          # Native relational database (node:sqlite) + seed logic
│   ├── AU_StudentSphere_MSSQL.sql     # Microsoft SQL Server (T-SQL) production schema & seed script
│   └── create_sample_pdfs.js          # Generator for sample certificate evidence PDFs
├── backend-dotnet/                    # ASP.NET Core 8 Web API (C#)
│   ├── AU.StudentSphere.Api.csproj
│   ├── Program.cs
│   ├── appsettings.json               # SQL Server connection string & JWT config
│   ├── Models/
│   │   └── Entities.cs                # 11 relational entities matching project requirements
│   ├── Data/
│   │   └── ApplicationDbContext.cs    # EF Core DbContext with constraints & indexes
│   └── Controllers/
│       └── ApiControllers.cs          # REST Controllers (Auth, Students, Achievements, Recs, Admin)
├── views/
│   ├── index.html                     # Responsive landing page with 3 login cards & quick fill
│   ├── student-dashboard.html         # Student portal (profile, courses, achievements, letters, upload)
│   ├── lecturer-dashboard.html        # Lecturer portal (demo student switcher, recommendation studio)
│   ├── admin-dashboard.html           # Administrator portal (verification queue, audit trail, stats)
│   └── recommendation-preview.html    # A4 printable official Africa University recommendation letterhead
├── uploads/
│   └── evidence/                      # Uploaded certificates and supporting proof files
└── static/
    ├── css/styles.css                 # Africa University design tokens & print styles
    ├── js/api.js                      # REST API client with fetch() and session management
    └── images/au-logo.png             # Official Africa University logo
```

### Relational Database Schema (11 Core Tables):
1. `Users` – Central authentication, password hashing, and role-based access.
2. `Students` – Student profiles, registration numbers, programmes, GPA, and personal details.
3. `Lecturers` – Faculty profiles, departments, titles, and office contacts.
4. `Administrators` – Quality assurance and records administration records.
5. `AcademicRecords` – Semester-by-semester courses, credit hours, grades, and grade points.
6. `Achievements` – Extracurricular and academic achievements with verification status.
7. `AchievementEvidence` – Uploaded certificates and supporting documents (`/uploads/evidence`).
8. `AchievementVerifications` – Audit log of administrator verification decisions and feedback.
9. `RecommendationLetters` – Formal recommendation letters with institutional reference numbers.
10. `RecommendationLetterAchievements` – Join table linking only **Verified** achievements to letters.
11. `Notifications` – System alerts dispatched upon verification decisions or letter issuances.
12. `AuditLogs` – Immutable security audit trail recording logins, verifications, and system actions.

---

## 4. Quick Start & Execution

### Option A: Run the Live Full-Stack Application (Node.js)

The application includes an embedded, zero-configuration relational database server (`node:sqlite`) ready to run immediately:

```powershell
# Navigate to the project root
cd "C:\Users\Al Batriq\Downloads\AU-STUDENTSPHERE-main\AU-STUDENTSPHERE-main"

# Start the application server
node server.js
```

Open your browser and navigate to:
**`http://localhost:5000`**

### Option B: Deploy to Microsoft SQL Server

1. Open **SQL Server Management Studio (SSMS)** or Azure Data Studio.
2. Open the file `database/AU_StudentSphere_MSSQL.sql`.
3. Execute the script to generate the database `AU_StudentSphere`, all 11 relational tables, foreign key constraints, indexes, views, and seed data.

### Option C: Run the ASP.NET Core Web API (C#)

```powershell
cd "C:\Users\Al Batriq\Downloads\AU-STUDENTSPHERE-main\AU-STUDENTSPHERE-main\backend-dotnet"
dotnet restore
dotnet run
```
The API will launch at `https://localhost:7001` or `http://localhost:5001/swagger`.

---

## 5. Key Workflows & Features

### A. Student Achievement Submission Workflow
1. Student signs into **Student Portal** (`/student`).
2. Navigates to **Submit Achievement** tab.
3. Selects Category (*Leadership*, *Volunteering*, *Academic Award*, *Competition*, *Certificate*), enters Title, Date, Organization, Description, and uploads supporting evidence (PDF/PNG/JPG).
4. The system automatically tags the credential as **`Pending Verification`** (Never auto-verified!).
5. The submission is immediately routed into the Administrator Verification Queue, and an administrative notification is triggered.

### B. Administrator Verification Workflow
1. Administrator signs into **Administrator Portal** (`/admin`).
2. Opens **Achievement Verification Queue**.
3. Clicks **Inspect** on any pending submission to review student info, category, description, and preview the uploaded certificate.
4. Executes one of three formal decisions:
   - **`VERIFY`**: Authenticates the credential, approving it for inclusion in recommendation letters.
   - **`RESUBMISSION REQUIRED`**: Prompts the student to supply clearer/stamped evidence with specific feedback.
   - **`REJECT`**: Rejects invalid or unaccredited submissions with a mandatory recorded justification.
5. Action is recorded in `AchievementVerifications` and the security `AuditLogs`.

### C. Lecturer Recommendation Letter Workflow
1. Lecturer signs into **Lecturer Portal** (`/lecturer`).
2. Switches seamlessly between **Ropafadzo Mwanza**, **Tanaka Dengende**, and **Tendesai Muyambo** using the dynamic student selector.
3. Reviews academic coursework and distinguishes verified vs. pending accomplishments.
4. Clicks **Generate Recommendation Letter** to open the **Recommendation Letter Studio**.
5. Selects only **verified** accomplishments via checkboxes to incorporate into the letter.
6. Clicks **Auto-Draft Content** or edits the letter text directly.
7. Saves as **Draft** or clicks **Issue Official Letter**.
8. Clicks **PDF View** to generate an official Africa University letterhead ready for A4 printing or saving as PDF!

---

## 6. Security & Integrity Controls

- **Role-Based Access Control (RBAC):** Server middleware rejects unauthorized endpoints across roles.
- **Strict Verification Enforcement:** Students cannot mark their own achievements as verified. Lecturers cannot override administrator verification decisions.
- **Evidence Whitelisting:** Uploads are strictly restricted to `.pdf`, `.png`, `.jpg`, `.jpeg`, and `.webp` with file size limits.
- **Audit Trails:** Administrative decisions, user logins, and letter issuances are immutably logged with timestamps and IP addresses.

---

*AU StudentSphere &bull; College of Engineering and Applied Sciences &bull; Africa University*
