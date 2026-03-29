from __future__ import annotations

import unittest

from pydantic import ValidationError

from core.vector_store import RetrievedContext
from main import FrameworkCheck, KnowledgeEvent, _verification_payload


class KnowledgeEventValidationTests(unittest.TestCase):
    def test_accepts_valid_cve_payload(self) -> None:
        event = KnowledgeEvent(
            content="SQL injection in login endpoint",
            category="Injection",
            severity="high",
            project="portal-web",
            source="nvd",
            timestamp="2026-03-29T09:30:00Z",
            cveId="CVE-2025-12345",
            cweIds=["CWE-89"],
            references=["https://nvd.nist.gov/vuln/detail/CVE-2025-12345"],
            publishedAt="2026-03-20T11:10:00Z",
        )

        self.assertEqual(event.cveId, "CVE-2025-12345")
        self.assertEqual(event.cweIds, ["CWE-89"])

    def test_rejects_invalid_cwe_format(self) -> None:
        with self.assertRaises(ValidationError):
            KnowledgeEvent(
                content="Cross-site scripting",
                source="nvd",
                timestamp="2026-03-29T09:30:00Z",
                cweIds=["79"],
            )

    def test_requires_reference_when_cve_or_cwe_present(self) -> None:
        with self.assertRaises(ValidationError):
            KnowledgeEvent(
                content="Broken auth path",
                source="manual",
                timestamp="2026-03-29T09:30:00Z",
                cveId="CVE-2024-1111",
            )

    def test_rejects_untrusted_reference(self) -> None:
        with self.assertRaises(ValidationError):
            KnowledgeEvent(
                content="Remote code execution bug",
                source="mitre",
                timestamp="2026-03-29T09:30:00Z",
                cveId="CVE-2024-2222",
                references=["https://random-blog.example.com/cve-2024-2222"],
            )


class VerificationScoringTests(unittest.TestCase):
    def _framework_checks(self) -> list[FrameworkCheck]:
        return [
            FrameworkCheck(
                id="owasp-a03-injection",
                severity="high",
                owasp="A03",
                cwe="CWE-89",
                title="Injection quick gate",
                evidence="raw query concatenation",
                recommendation="Use parameterized queries",
            )
        ]

    def test_sets_review_true_when_no_context(self) -> None:
        payload = _verification_payload(
            reply="Need deeper verification",
            contexts=[],
            framework_checks=self._framework_checks(),
        )

        self.assertTrue(payload["needsHumanReview"])
        self.assertEqual(payload["citations"], [])
        self.assertLess(payload["confidenceScore"], 0.55)

    def test_sets_review_false_for_grounded_high_confidence_output(self) -> None:
        contexts = [
            RetrievedContext(
                id="ctx-1",
                score=0.93,
                content="CVE-2025-12345 SQL injection vulnerability in auth module",
                metadata={
                    "source": "nvd",
                    "project": "trusted-feed",
                    "category": "Injection",
                    "cve_id": "CVE-2025-12345",
                    "cwe_ids": "CWE-89",
                    "reference": "https://nvd.nist.gov/vuln/detail/CVE-2025-12345",
                    "published_at": "2026-03-20T11:10:00Z",
                },
            )
        ]

        payload = _verification_payload(
            reply="The issue is validated against retrieved CVE context.",
            contexts=contexts,
            framework_checks=self._framework_checks(),
        )

        self.assertFalse(payload["needsHumanReview"])
        self.assertGreaterEqual(payload["confidenceScore"], 0.55)
        self.assertEqual(payload["citations"][0]["cveId"], "CVE-2025-12345")


if __name__ == "__main__":
    unittest.main()
