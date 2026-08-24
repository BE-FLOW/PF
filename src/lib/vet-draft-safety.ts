import type { VetReviewDraft } from "./types";

export type VetDraftSafetyViolation =
  | "diagnosis"
  | "medication"
  | "dosage"
  | "treatment_plan"
  | "ungrounded_fact";

const diagnosticClaimPatterns = [
  /(?:질환|질병|병|증후군|감염)(?:으로|로)\s*(?:진단|확정|판단)(?:됩니다|됐습니다|되었습니다|할 수 있습니다)/iu,
  /(?:진단명|진단 결과)(?:은|는|:)?\s*[^.\n]{1,80}(?:입니다|으로 보입니다|가능성이 높습니다)/iu,
  /(?:확실히|명백히)\s*[^.\n]{0,40}(?:질환|질병|병|감염)/iu,
  /(?:질환|질병|감염|바이러스|세균)[^.\n]{0,40}(?:가능성이\s*(?:높|있)|의심|추정|으로\s*보)/iu,
  /(?:가능성이\s*(?:높|있)|의심|추정)[^.\n]{0,40}(?:질환|질병|감염|바이러스|세균)/iu,
  /(?:diagnosed with|diagnosis is|definitely has|likely has)\b/iu,
];

const medicationPatterns = [
  /(?:항생제|진통제|소염제|스테로이드|인슐린|해열제|진정제|구충제|약물명|처방약|처방전|처방)/iu,
  /(?:아목시실린|메트로니다졸|프레드니솔론|가바펜틴|멜록시캄|카프로펜|타이레놀|이부프로펜)/iu,
  /\b(?:amoxicillin|metronidazole|prednisolone|gabapentin|meloxicam|carprofen|acetaminophen|ibuprofen)\b/iu,
];

const dosagePatterns = [
  /\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml|mL|cc|IU|units?)\b/iu,
  /\d+(?:\.\d+)?\s*(?:정|캡슐|포|방울)(?:씩|을|를)?/u,
  /(?:투여|복용|도포|급여)[^.\n]{0,20}(?:하루|1일)\s*\d+\s*(?:회|번)/u,
  /(?:하루|1일)\s*\d+\s*(?:회|번)[^.\n]{0,20}(?:투여|복용|도포|급여)/u,
  /(?:administer|dose|take)[^.\n]{0,30}\bevery\s+\d+\s*(?:hours?|hrs?)\b/iu,
];

const treatmentPlanPatterns = [
  /(?:치료|처치|수술)(?:가|를|은|는| 계획| 방침)?[^.\n]{0,40}(?:필요|권장|시행|시작|진행|하세요|해야)/u,
  /(?:투여|복용|도포|급여)[^.\n]{0,40}(?:하세요|해야|권장|필요|계획|시작)/u,
  /\b(?:treat(?:ment)?|surgery|administer|prescribe)[^.\n]{0,50}\b(?:recommend|should|must|plan)\b/iu,
];

function generatedText(draft: VetReviewDraft) {
  return [
    draft.overview,
    draft.handoffNote,
    ...draft.keyObservations,
    draft.submissionNote,
  ].join("\n");
}

const observableFactPatterns = [
  /혈변|피가\s*섞인\s*변/u,
  /혈뇨|피가\s*섞인\s*소변/u,
  /토혈|피를\s*토/u,
  /구토|토했|토함/u,
  /설사|묽은\s*변/u,
  /기침/u,
  /재채기/u,
  /호흡\s*곤란|숨쉬/u,
  /발작|경련/u,
  /실신|의식\s*소실/u,
  /출혈/u,
  /통증|아파/u,
  /절뚝|파행/u,
  /식욕/u,
  /활력|기운/u,
  /배뇨|소변/u,
  /배변|대변/u,
  /가려움|긁/u,
  /체중/u,
  /떨림|떨었/u,
] as const;

function countedFacts(text: string) {
  return new Set(
    text
      .match(/\d+(?:\.\d+)?\s*(?:회|번|일|시간|분|주|개월|마리|개)/gu)
      ?.map((value) => value.replace(/\s+/g, "").toLowerCase()) ?? [],
  );
}

export function vetDraftGroundingViolation(
  generatedDraft: VetReviewDraft,
  sourceDraft: VetReviewDraft,
): VetDraftSafetyViolation | null {
  const generated = generatedText(generatedDraft);
  const source = [
    sourceDraft.overview,
    sourceDraft.handoffNote,
    ...sourceDraft.keyObservations,
    ...sourceDraft.timeline,
    ...sourceDraft.mediaSummary,
    ...sourceDraft.planAndProgress,
    ...sourceDraft.questionsForVet,
    sourceDraft.submissionNote,
  ].join("\n");

  const sourceCounts = countedFacts(source);
  if ([...countedFacts(generated)].some((fact) => !sourceCounts.has(fact))) {
    return "ungrounded_fact";
  }
  if (
    observableFactPatterns.some(
      (pattern) => pattern.test(generated) && !pattern.test(source),
    )
  ) {
    return "ungrounded_fact";
  }
  return null;
}

export function vetDraftSafetyViolation(
  draft: VetReviewDraft,
): VetDraftSafetyViolation | null {
  const text = generatedText(draft);
  if (dosagePatterns.some((pattern) => pattern.test(text))) return "dosage";
  if (medicationPatterns.some((pattern) => pattern.test(text))) {
    return "medication";
  }
  if (diagnosticClaimPatterns.some((pattern) => pattern.test(text))) {
    return "diagnosis";
  }
  if (treatmentPlanPatterns.some((pattern) => pattern.test(text))) {
    return "treatment_plan";
  }
  return null;
}
