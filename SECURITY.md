# Security

Do it. holds people's names, photos, goals and daily check-ins, so we take reports seriously.

## Reporting a problem

Please [report it privately](https://github.com/aashikahmed/do-it/security/advisories/new). Don't open a public issue or pull request, because that shows everyone the problem before it's fixed.

Tell us what you found, how to reproduce it and what someone could do with it. We'll reply as soon as we can. This is a small project, so that may take a few days.

## Testing

Test against your own local copy (see [CONTRIBUTING.md](CONTRIBUTING.md)). Please don't probe the live app at doit.launchit.ae, and never access, change or share anyone else's data.

## Good to know

These are public by design and aren't vulnerabilities on their own:

- The Supabase project URL and anon key, which ship to every browser. Row level security protects the data.
- The VAPID public key.
