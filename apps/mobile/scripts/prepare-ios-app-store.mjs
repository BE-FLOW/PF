import {
  appStoreConnectDefaults,
  createAppStoreConnectClient,
  parseArgs,
} from "./lib/app-store-connect.mjs";

const defaults = {
  appId: appStoreConnectDefaults.appId,
  keyId: appStoreConnectDefaults.keyId,
  issuerId: appStoreConnectDefaults.issuerId,
  locale: "ko",
  versionString: "1.0",
};

const metadata = {
  description: `PetFlow는 보호자가 반려동물의 식욕, 활력, 증상과 병원에서 들은 안내를 짧게 기록하고 다음 상담에 보여주기 좋게 정리하는 앱입니다.

처음부터 완벽한 기록을 요구하지 않습니다. 짧은 글과 사진·영상으로 관찰을 남기면 기록이 날짜순 흐름에 자동으로 연결됩니다. 필요한 기간을 골라 병원에 전달할 사실 요약을 만들 수 있습니다.

주요 기능
- 계정 기반 반려동물 관리
- 날짜별 건강 기록 입력
- 사진과 동영상 첨부
- 예방접종 기록과 다음 접종일 메모
- 병원에 보여줄 건강 흐름과 사실 요약
- 첫 1회 무료 후 인앱결제로 한 번씩 추가하는 AI 병원 요약과 사용자 피드백
- 계정 화면의 즉시 계정 탈퇴

PetFlow는 진단이나 처방을 제공하지 않습니다. AI 리포트는 로그인 사용자의 기록을 정리한 수의사 검토용 초안이며, 수의사의 확인을 대신하지 않습니다.`,
  keywords:
    "반려동물,강아지,고양이,건강기록,병원공유,진료메모,펫케어,건강흐름,예방접종,사진기록",
  marketingUrl: "https://pf-two-eta.vercel.app",
  promotionalText:
    "관찰한 변화를 짧게 남기고, 병원에 보여줄 건강 흐름과 사실 요약으로 정리해요.",
  supportUrl: "https://pf-two-eta.vercel.app",
};

const appInfoMetadata = {
  subtitle: "반려동물 건강 기록과 병원 공유",
  privacyPolicyUrl: "https://pf-two-eta.vercel.app/privacy",
};

const reviewNotes = `PetFlow offers one complimentary AI Hospital Summary. Additional summaries are sold only as a consumable in-app purchase named "AI Hospital Summary - 1 Use". It is not a subscription and does not renew automatically.

There is no participation code, redeemable code, account tier, or link to an external checkout in the iOS app. Purchases are attached to the signed-in PetFlow account and verified by the server before one summary credit is granted. The Account screen includes "Check Purchase History" for interrupted or delayed purchase verification.

Review steps:
1. Sign in using the review account already provided in App Review Information.
2. Complete the required account information if requested.
3. Add or select a pet and create a health record.
4. Open Health Flow, select the record group, and tap AI Hospital Summary.
5. After the complimentary use is consumed, the app shows the localized App Store price before opening the Apple purchase sheet.

The AI output is labeled as an unreviewed draft. It organizes the user's own observations for veterinary review and does not provide diagnosis, prescriptions, medication names, dosage, or treatment plans.

The original records, editing, deletion, and basic sharing remain available without a purchase. The screenshots show the current Home, health record, Health Flow, account, and hospital-sharing summary screens.`;

const args = parseArgs();

const appId = args.get("--app-id") || process.env.ASC_APP_ID || defaults.appId;
const keyId = args.get("--key-id") || defaults.keyId;
const issuerId = args.get("--issuer-id") || defaults.issuerId;
const locale = args.get("--locale") || defaults.locale;
const versionString = args.get("--version") || defaults.versionString;

const { request } = createAppStoreConnectClient({ keyId, issuerId });

async function findAppStoreVersion() {
  const response = await request(`/v1/apps/${appId}/appStoreVersions?limit=10`);
  const version =
    response.data.find((item) => item.attributes.versionString === versionString) ??
    response.data.find((item) => item.attributes.appStoreState === "PREPARE_FOR_SUBMISSION");
  if (!version) {
    throw new Error(`No App Store version found for ${versionString}. Create it in App Store Connect first.`);
  }
  return version;
}

async function findLatestValidBuild() {
  const response = await request(`/v1/builds?filter[app]=${appId}&limit=10`);
  const build = response.data.find(
    (item) => item.attributes.processingState === "VALID" && !item.attributes.expired,
  );
  if (!build) throw new Error("No valid iOS build found.");
  return build;
}

async function connectBuild(versionId, buildId) {
  await request(`/v1/appStoreVersions/${versionId}/relationships/build`, {
    method: "PATCH",
    body: JSON.stringify({ data: { type: "builds", id: buildId } }),
  });
}

async function findLocalization(versionId) {
  const response = await request(
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=20`,
  );
  let localization = response.data.find((item) => item.attributes.locale === locale);
  if (localization) return localization;

  const created = await request("/v1/appStoreVersionLocalizations", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "appStoreVersionLocalizations",
        attributes: { locale },
        relationships: {
          appStoreVersion: { data: { type: "appStoreVersions", id: versionId } },
        },
      },
    }),
  });
  localization = created.data;
  return localization;
}

async function updateLocalization(localizationId) {
  const response = await request(`/v1/appStoreVersionLocalizations/${localizationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appStoreVersionLocalizations",
        id: localizationId,
        attributes: metadata,
      },
    }),
  });
  return response.data;
}

async function findAppInfoLocalization() {
  const appInfos = await request(`/v1/apps/${appId}/appInfos?limit=10`);
  const appInfo = appInfos.data[0];
  if (!appInfo) throw new Error("No App Store app info found.");

  const localizations = await request(
    `/v1/appInfos/${appInfo.id}/appInfoLocalizations?limit=20`,
  );
  const localization = localizations.data.find((item) => item.attributes.locale === locale);
  if (!localization) {
    throw new Error(`No app info localization found for ${locale}. Create it in App Store Connect first.`);
  }
  return localization;
}

async function updateAppInfoLocalization(localizationId) {
  const response = await request(`/v1/appInfoLocalizations/${localizationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appInfoLocalizations",
        id: localizationId,
        attributes: appInfoMetadata,
      },
    }),
  });
  return response.data;
}

async function updateReviewNotes(versionId) {
  const detail = await request(
    `/v1/appStoreVersions/${versionId}/appStoreReviewDetail`,
  );
  if (!detail?.data?.id) {
    throw new Error("No App Store review detail found for this version.");
  }
  const response = await request(`/v1/appStoreReviewDetails/${detail.data.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "appStoreReviewDetails",
        id: detail.data.id,
        attributes: { notes: reviewNotes },
      },
    }),
  });
  return response.data;
}

const app = await request(`/v1/apps/${appId}`);
const version = await findAppStoreVersion();
const build = await findLatestValidBuild();
await connectBuild(version.id, build.id);
const localization = await findLocalization(version.id);
const updatedLocalization = await updateLocalization(localization.id);
const appInfoLocalization = await findAppInfoLocalization();
const updatedAppInfoLocalization = await updateAppInfoLocalization(appInfoLocalization.id);
const updatedReviewDetail = await updateReviewNotes(version.id);
const connectedBuild = await request(`/v1/appStoreVersions/${version.id}/build`);

console.log(
  JSON.stringify(
    {
      app: {
        id: app.data.id,
        name: app.data.attributes.name,
        bundleId: app.data.attributes.bundleId,
        primaryLocale: app.data.attributes.primaryLocale,
      },
      version: {
        id: version.id,
        versionString: version.attributes.versionString,
        state: version.attributes.appStoreState,
      },
      build: {
        id: connectedBuild.data.id,
        buildNumber: connectedBuild.data.attributes.version,
        processingState: connectedBuild.data.attributes.processingState,
      },
      localization: {
        id: updatedLocalization.id,
        locale: updatedLocalization.attributes.locale,
        descriptionLength: updatedLocalization.attributes.description.length,
        keywords: updatedLocalization.attributes.keywords,
        supportUrl: updatedLocalization.attributes.supportUrl,
      },
      appInfoLocalization: {
        id: updatedAppInfoLocalization.id,
        locale: updatedAppInfoLocalization.attributes.locale,
        subtitle: updatedAppInfoLocalization.attributes.subtitle,
        privacyPolicyUrl: updatedAppInfoLocalization.attributes.privacyPolicyUrl,
      },
      reviewDetail: {
        id: updatedReviewDetail.id,
        notesLength: updatedReviewDetail.attributes.notes.length,
      },
    },
    null,
    2,
  ),
);
