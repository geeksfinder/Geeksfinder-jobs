# Security

GeeksFinder holds students' resumes and contact details, so security reports are welcome and taken seriously.

**Report a problem privately:** email the address on https://geeksfinder-jobs.vercel.app/contact with the subject
"Security", or use GitHub's "Report a vulnerability" button on this repository. Please don't open a public issue
for security problems.

What helps: what you found, how to reproduce it, and what someone could do with it. We'll reply within 3 working days.

Please don't access other people's data, run automated scans against the live site, or send spam while testing.

**For contributors:** never commit keys, tokens or passwords. Every secret is read from an environment variable;
`web/.env.example` lists them all with no values. CI fails if anything that looks like a secret is committed.
