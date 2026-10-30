RVNP ATTACHMENT PORTAL v3  (student link + your admin site)
============================================================
Student link :  https://YOUR-SITE.netlify.app/        (share this in the WhatsApp groups)
Your admin   :  https://YOUR-SITE.netlify.app/admin.html   (password protected)

The student page, the attachment letter and the insurance cover look exactly as before.
What changed: the student list, policy details and courses now live online, so you edit them
in the admin site and students see the change immediately. No build.py, no re-uploading.

ONE-TIME SETUP (Netlify, about 10 minutes)
------------------------------------------
This version has a small server part, so drag-and-drop of a folder will NOT work.
Use either option:

A) Netlify CLI (no GitHub needed)
   1. Install Node.js (nodejs.org), then in this folder run:
        npm install
        npm install -g netlify-cli
        netlify login
        netlify init            (choose "Create & configure a new project", or link your existing site)
   2. In the Netlify dashboard: Site configuration > Environment variables >
      add  ADMIN_PASSWORD  = (the password you want for the admin site)
   3. Deploy:   netlify deploy --prod

B) GitHub: push this folder to a GitHub repository, then in Netlify choose
   "Import from Git". Add the ADMIN_PASSWORD variable, and deploy.

FIRST LOGIN
-----------
1. Open /admin.html and sign in.
2. Insurance covers tab > Upload students with insurance > choose your existing
   RVNP_Attachment_Students_Database.xlsx > Upload list. (209 students.)
3. Check the policy details above it and save.

DAILY USE
---------
Insurance covers tab : upload a new Excel/CSV list (add or replace), add or remove one student,
                       change policy number and dates.
Attachment letters   : add or edit a course, its percentage covered and its list of units.
Changing the ADMIN_PASSWORD variable in Netlify and redeploying changes your password.
