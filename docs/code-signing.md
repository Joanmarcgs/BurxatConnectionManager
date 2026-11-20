# Code signing (Windows)

Windows shows a SmartScreen "unknown publisher" warning for executables that aren't signed with a
code-signing certificate. This project applies for the free code signing that the
[SignPath Foundation](https://signpath.org/) provides to open-source projects. This page is the
maintainer checklist for setting that up; the CI workflow is `.github/workflows/release.yml`.

Neither a personal digital certificate (FNMT, idCAT, …) nor a website TLS certificate can be used
for this — they lack the *Code Signing* usage and don't chain to a CA Windows trusts for it.

## How it works

1. Pushing a `v*` tag runs the **Release** workflow on GitHub-hosted runners (SignPath only signs
   builds it can verify came from CI).
2. The Windows job builds the app and stages it (`scripts/build-portable-win.ps1 -StageOnly`),
   uploads the staged folder, and submits it to SignPath.
3. SignPath signs the two executables listed in `.signpath/artifact-configuration.xml`
   (the launcher and `app/BurxatConnectionManager.exe`). **A maintainer must approve each request
   in the SignPath web UI** — the workflow waits for it (up to an hour).
4. The signed files are zipped (`-ZipStage`) and attached to the GitHub release together with the
   Linux tarball. The release notes are this version's section of `CHANGELOG.md`.

If `SIGNPATH_API_TOKEN` isn't configured, the workflow still builds and publishes an **unsigned**
Windows zip, so releases keep working before SignPath is set up.

## One-time setup

1. **Enable MFA** on your GitHub account and on SignPath (SignPath requires it for everyone on the
   team).
2. **Apply** at <https://signpath.org/apply>. The README's *Code signing policy* section must be
   public first (it is). Acceptance is at SignPath's discretion.
3. In SignPath, create the **project** (slug `burxat-connection-manager`, or set the
   `SIGNPATH_PROJECT_SLUG` repo variable), add the predefined **GitHub.com trusted build system**
   and link it to the project, and create a signing policy (slug `release-signing`, or set
   `SIGNPATH_SIGNING_POLICY_SLUG`) that requires approval. Paste
   `.signpath/artifact-configuration.xml` as the project's artifact configuration.
4. Create an **API token** for a user allowed to submit to that policy.
5. In the GitHub repo settings add:
   - secret `SIGNPATH_API_TOKEN` — the API token;
   - variable `SIGNPATH_ORGANIZATION_ID` — your SignPath organization id (and the two slug
     variables above if you used different slugs).
6. Run the workflow once with **Actions → Release → Run workflow** (no release is created for
   manual runs) and approve the request in SignPath to check the whole chain.

## Things to check on the first signed run

These couldn't be verified without a SignPath account:

- That `${version}` in the artifact configuration is filled from the workflow's `parameters:`.
- That both executables pass SignPath's product name/version check. Both currently report
  `BurxatConnectionManager` / `<version>.0`; the build script gives the launcher that metadata.
- That the signed output folder has the same layout as the staged folder (the workflow zips it
  as-is).

## SmartScreen

A valid signature removes the "unknown publisher" label (the publisher shows as *SignPath
Foundation*). Standard certificates can still show a SmartScreen reputation warning until enough
people have run the signed file, so don't expect it to vanish on day one.
