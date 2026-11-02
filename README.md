# RVNP Industrial Attachment Portal

Students download their attachment letter and personal accident insurance cover.
The admin manages courses, insurance policy details, student lists and cover requests.

The portal includes a unified responsive visual theme using RVNP navy, green and gold styling. The theme is provided by `portal-theme.css`, which must be deployed alongside the HTML pages.

## Files (keep all project files at the top level, not inside a sub-folder)

| File | Purpose |
|---|---|
| index.html | Student page (attachment letter and insurance cover) |
| portal-theme.css | Shared responsive design theme used by all portal pages |
| admin.html | Admin page (open at `your-site/admin.html`) |
| register.html | Page where students fill in their name, admission number, class and contact number (`your-site/register.html`) |
| placement.html | Students tell the college where they were placed and see their trainer (`your-site/placement.html`) |
| hod.html | ILO HOD / deputy HOD page for adding trainers and assigning students (`your-site/hod.html`, needs the access code) |
| marks.js | Marks panel (view, upload, download) used on the admin, HOD and ILO pages |
| manifest.webmanifest, manifest-ilo.webmanifest, manifest-hod.webmanifest, sw.js, pwa.js, icon-192.png, icon-512.png, icon-maskable.png, apple-touch-icon.png | Make the portal installable as an app |
| ilo.html | Page for ILO representatives of departments (open at `your-site/ilo.html`) |
| api.mjs | Server code: search, requests, admin, storage |
| netlify.toml, package.json | Netlify settings |
| letterhead.png, signature.png, iso.png | Images printed on the letter |
| cover_bg.jpg, cover_font.ttf | Background and font for the insurance cover |

## Put the files on GitHub (do this first)

1. Unzip the portal ZIP. Open the folder and check that all project files (including `portal-theme.css`) are directly inside, not nested in another folder.
2. Sign in at github.com (free account).
3. Tap **+**, then **New repository**. Use any name (for example `rvnp-attachment-portal`), choose **Private**, then **Create repository**.
4. Tap **uploading an existing file**, then **choose your files**. Select all 10 files (not the folder, not the zip). On a phone, turn on **Desktop site** in your browser first. Upload in batches if needed.
5. Check that all project files are listed, then tap **Commit changes**.

To update later: open the repository, **Add file**, then **Upload files**. Files with the same name replace the old ones.

## Connect GitHub to Netlify

**Keep your current site (keeps students, courses and settings):**
1. Netlify: open your site, then **Site configuration**, **Build & deploy**, **Continuous deployment**, **Link repository**.
2. Choose GitHub, allow access, select your repository.
3. Leave the build command empty. Keep the publish directory as `.`. Save.
4. **Deploys**, **Trigger deploy**, **Deploy site**. Wait for **Published**.

**New site instead (new link, empty data):**
1. **Add new site**, **Import an existing project**, GitHub, pick the repository, leave the build command empty, **Deploy**.
2. **Site configuration**, **Environment variables**: add `ADMIN_PASSWORD`, then redeploy.
3. Upload students and courses again from the admin page.

## After deploying

1. Make sure `ADMIN_PASSWORD` exists under **Site configuration**, **Environment variables**. If you change it, redeploy.
2. Open `your-site/admin.html` and sign in.
3. **Insurance covers**: check the default policy number, insurer, start and end dates and issue date. Upload the student list (Class code, Student name, Admission number). "Add new and update existing" keeps what is already there. "Replace the whole list" removes anyone not in the file.
4. **Attachment letters**: check each course's title, percentage and units. Use **+ Add a course** for a new course, then **Save courses**.
5. Test on a phone: download a letter and compare it with the preview, search a student and download a cover, and send a test cover request.
6. Share the student link (copy or WhatsApp button on the admin page).

## Students and insurance covers

- Students type 3 or more letters of their name or admission number and pick themselves from the suggestions to download their cover.
- Anyone who types 3 letters can see matching students' names, admission numbers and classes. Upload only students who should be findable this way.
- Students not on the list can send a request with full name, class, course and admission number.

## Departments and courses

- Students first choose their **department**, then their **course** in it. The 9 departments and their courses come from the 2026-2027 brochure (about 120 courses).
- A course with no units yet shows "(coming soon)" and its letter cannot be downloaded until units are added. Your existing Electrical and Telecommunication courses keep their units.
- Admin page, **Attachment letters** tab: choose a department (or type part of a course name) to list its courses. Edit the title, department, percentage and units, then **Save courses**.
- To add a course: choose the department, press **+ Add a course to this department**, fill it in and Save.
- Nothing is listed until you choose a department or type at least 2 letters, so the page stays short.

## Units from ILO representatives

1. On the admin page, copy the **ILO representatives link** (`your-site/ilo.html`) and send it to each department's ILO representative.
2. They choose their department and course, enter the percentage covered and the units (one per line), and send.
3. You see them in the **ILO units** tab (the counter shows how many are waiting). **Approve** puts the units on that course's letter at once. **Reject** deletes the submission.
4. If their course is not listed they can type its name. Approving adds it to their department.
- Nothing changes on student letters until you approve.

## NITA form

Admin page, **Attachment letters** tab, **NITA form** card: upload the form (PDF, Word or image, up to 4 MB). Students then see a **NITA form** download button at the top of the student page. Remove it any time.

## Searching on the admin page

The Insurance covers student list and the course list stay hidden until you search (2 or more letters) or choose a department. The full student list is still available as **Download list (CSV)**.

## Handling cover requests

1. Admin page, **Cover requests** tab (the counter shows how many are waiting).
2. Each request has two buttons under the student's name:
   - **Approve**: opens a small box. Leave "This student is on a different policy" unticked to use the default policy, or tick it and enter that student's own policy number, date of issue, start date and expiry date. Press Approve. The student moves to the students list and can download their cover straight away.
   - **Remove**: deletes the request.
3. **Approve all (default policy)** approves every waiting request at once.
4. You can still upload a finished Excel/CSV list under **Insurance covers**. Requests for students on that list clear automatically.

## Students on a different policy

Every cover uses the **default policy** (Insurance covers tab, Policy details) unless you give the student another one. There are three levels, from most to least common:

1. **Named policies (best for groups).** In the **Other policies** card, press **+ Add a policy** and fill in a name (e.g. "Policy 2 - January intake"), policy number, insurer, start, expiry and issue date. Create each extra policy once, then:
   - give it to a **whole class** (choose the class and the policy, then Apply), or
   - give it to **one student** (search them, press **Policy** under their name, choose it), or
   - choose it when you **Approve** a cover request, or use the dropdown next to **Approve all**, or
   - put its name in a **Policy** column in your Excel/CSV upload.
   If you later edit a policy (for example a corrected date), every student on it updates automatically. Removing a policy sends its students back to the default.
2. **Custom dates for one student.** In that student's **Policy** box choose "Custom dates for this student only..." and enter the details. Use this only for one-offs.
3. **Default policy.** Everyone else.

The student's cover (and the policy number and insurer in their attachment letter) shows their own policy. The layout never changes. Giving a class or student a named policy replaces any one-off custom dates they had. Uploading again without a Policy column keeps what each student already has.

## Insurance policy for a whole class (from the ILO representative)

1. On the ILO page (`your-site/ilo.html`), the second card, **Insurance cover for a class**, lets the representative choose the class, then choose the policy it uses: the default, one of your policies, or "A policy not listed here" (they type the policy number, insurer and dates).
2. You see it in the **ILO units** tab (press **Refresh** to load new ones). **Approve and apply to the whole class** puts every student of that class on that policy at once. A new policy is added to your list automatically (you can rename it under **Other policies**).
3. The class remembers its policy: students added later (upload or approved request) in that class get it automatically. You can also set it yourself with **Give a policy to a whole class**. The **Class policies** line shows what each class uses.
4. When you approve a cover request, the box is already set to the class's policy; change it if that student is an exception.

**Letter and cover always match.** The attachment letter and the insurance cover read the policy number (and insurer and dates) from the same place for each student, so the numbers are always the same. If you change a student's or class's policy later, covers and letters downloaded after that show the new number.

## Student database (details filled in by students)

1. Share the **student details link** (`your-site/register.html`). You can copy it from the admin page (**Student database** tab) or from the ILO page, so ILO representatives can send it to their classes too.
2. Students enter their full name, admission number, class and contact number. If they submit again with the same name and admission number, their details are updated, not duplicated.
3. In the admin page, **Student database** tab, you see the **total number of students**, the number per class, and how many already have an insurance cover. Tap a class to list its students, or search by name, admission number, class or phone (the list stays hidden until you do).
4. **Download Excel (by class)** gives one file with a Summary sheet (students per class and the total), an "All students" sheet sorted by class, and a separate sheet for each class. **Download CSV** gives the same list as one sorted file.
5. Remove a student with the Remove button next to their name.

## Installing the portal as an app

Every page that students open shows an **Install app** button at the bottom right.
- **Android (Chrome, Edge, Samsung Internet):** tap **Install app**, then **Install**. The RVNP icon appears on the home screen and opens the portal like an app.
- **iPhone / iPad:** open the link in **Safari**, tap **Install app** to see the steps (Share, then **Add to Home Screen**). Apple does not allow a one-tap install.
- The button disappears once the app is installed. The installed app always opens the latest version when the phone is online.
- Browsers only offer installation on the secure (https) Netlify address, which yours is.
If you ever change sw.js, change the `VERSION` line at the top of it so phones refresh their saved copy.

## Placements and trainers

1. **Students** open the **Attachment placement** card on the portal (or `your-site/placement.html`) once they have a place. They enter name, admission number, department, course, two phone numbers, the organization with a description of where it is (road and landmark, "near ..."), their supervisor at the organization, and the town. Submitting again with the same name and admission number corrects the entry.
2. **Admin page, Placements tab:** set the **HOD access code** (at least 6 characters), copy the **HOD link** (`your-site/hod.html`) and send it, with the code, to the ILO HOD / deputy HOD. The tab also shows how many students are placed and assigned, per department and per trainer, and downloads everything as Excel (summary, all placements with the trainer, one sheet per department).
3. **The HOD** opens the link, types the code, and:
   - adds trainers (name and phone number),
   - filters students by department, town, or "waiting for a trainer", ticks the students (or **Select all shown**), chooses a trainer and presses **Assign**,
   - sees how many students each trainer has, and can open or remove a trainer. Removing a trainer sends their students back to "waiting".
   - downloads an Excel file with one sheet per trainer.
4. **Students see their trainer:** on the same placement page, under **Find my trainer**, they type their name or admission number and see their trainer's name and phone number (tap to call) as soon as one is assigned.
The HOD code protects students' phone numbers. Share it only with the HOD and deputy HOD, and change it from the Placements tab if it leaks.

## Troubleshooting

- **Old version still showing:** open the site in a private tab or hard refresh.
- **Admin sign-in fails:** check `ADMIN_PASSWORD`, then redeploy.
- **Search or requests do nothing:** api.mjs was not deployed. Check it is in the repository at the top level.
- **No "Link repository" button:** open **Continuous deployment** and check what it says, or create a new site from GitHub (see above).
- **Letter PDF differs from preview:** use an up-to-date browser and report which phone and browser you used.

## Installing the app (everyone)

Every page has a green **Install app** button: students, admin, ILO representatives, and the HOD / deputy HOD. The ILO page installs as "RVNP ILO" and opens straight to the ILO page. The HOD page installs as "RVNP HOD" and opens straight to the HOD page. On iPhone the button shows the Share, then Add to Home Screen steps.

## Look

Green and white theme with orange accents (title underline, counters, selected tabs, hover, missing-marks figures). Colours are set in one place at the top of each page (`:root{--ac:...}`).

## Marks

**Who can do what**

| Who | See | Download | Upload marks |
|---|---|---|---|
| ILO representative | Only their own department | One class, or the whole department | Yes, own department only |
| HOD / deputy HOD (access code) | All departments | One class, a department, or everything | Yes |
| Admin | All departments | One class, a department, or everything | Yes |

**Setting it up (admin page, Marks tab)**
1. **Department codes**: pick a department, type a code (6+ characters), Save. Give each ILO representative the code for their department only. One code opens one department.
2. **Upload marks**: Excel or CSV with columns **Admission number**, **Marks**, and optionally **Out of** (default 100). Students are matched by admission number. Uploading again updates marks already saved. Rows that do not match anyone, or have marks above the total, are reported and skipped.
3. **Class to department**: the system works out each class's department from the placements its students filled in. A class with no placements shows "Not yet assigned". Press **Change** next to the class to set its department.

**Downloads (Excel)**
- Every class sheet lists **all students in the database for that class**, not only those with marks. A class of 50 with 25 marks shows "Marks received: 25 of 50 (50%)", "Marks missing: 25", and each missing student marked **NOT YET SUBMITTED**.
- Each student row shows Marks, Out of and **Percentage**.
- The **Summary** sheet has one line per class: students, marks received, marks missing, % of class with marks, average, highest and lowest percentage.
- Whole department: Summary plus one sheet per class, sorted by class. Bulk download adds an **All students** sheet with everyone in one list.

**ILO representatives can upload and edit.** On the ILO page, after opening their department with its code, a rep can upload an Excel/CSV of marks, or choose a class and press **Edit marks of selected class** to change a mark or clear it. Students from other departments are skipped and reported, so a rep can never change another department's marks.

**Entering marks:** in the Marks panel, use **Search a student** (name or admission number) to find one student and type their mark, or choose a class and press **Edit whole class** to enter marks for everyone in it. Searches only cover the rep's own department.

**Standard marksheets (orange "Standard marksheets" button in the Marks panel)**
1. Press the button, then upload your department's standard marksheet (Excel **.xlsx**), with the students already arranged in the order you want. It needs a header row with an **Admission** column and a **Marks** column (and optionally a **%** column). It is saved for your department, so you upload it once.
2. Enter or upload the marks as usual.
3. Press **Transfer marks** next to the marksheet. Your sheet downloads with the marks filled in. Students stay in your order, and your layout, colours and merged cells are kept. Matching is by admission number.
4. A report shows how many marks were transferred, which students in your sheet have no marks yet, which admission numbers were not found, and which students with marks are not on your sheet. If the system cannot find your Marks column, type its letter (for example F) in the box before pressing Transfer. Cells that contain formulas are left alone.


### Visual colour update
The portal uses a balanced green, orange and white palette: green remains the institutional identity and primary action colour; orange is used for highlights, selected navigation, secondary actions and status accents; white and soft neutral backgrounds keep pages clean and readable. Official print templates remain unchanged.
