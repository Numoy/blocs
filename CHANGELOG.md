# Changelog

All notable changes to this project should be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Open-source governance baseline (`LICENSE`, `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`).
- Trust and operations docs (`PRIVACY.md`, `SUPPORT.md`, `RELEASE.md`, `THREAT_MODEL.md`).
- Repository ownership policy via `.github/CODEOWNERS`.
- Signature policy workflow for verified commits to `main`.

### Changed
- Pinned GitHub Actions workflows to immutable commit SHAs.
- Release workflow now verifies signed annotated tags, signs images (cosign), publishes provenance attestations, and uploads an SPDX SBOM artifact.
