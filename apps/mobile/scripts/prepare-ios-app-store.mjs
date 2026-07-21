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
  description: `PetFlow는 보호자가 반려동물의 식욕, 활력, 증상, 병원에서 들은 계획과 경과를 짧게 기록하고 다음 상담에 보여주기 좋게 정리하는 앱입니다.

처음부터 완벽한 기록을 요구하지 않습니다. 오늘 확인한 내용만 남기고, 같은 사건에 이어 3일·7일·14일 경과와 장기 30일·60일·90일 변화를 쌓아 병원에 다시 설명하는 시간을 줄이는 것을 목표로 합니다.

주요 기능
- 계정 기반 반려동물 관리
- 오늘 건강 기록 입력
- 사진과 동영상 첨부
- 예방접종 기록과 다음 접종일 메모
- 병원에 보여줄 요약과 경과 기록
- 로그인 사용자용 AI 병원 요약과 사용자 피드백
- 계정 화면의 계정 삭제 요청

PetFlow는 진단이나 처방을 제공하지 않습니다. AI 리포트는 로그인 사용자의 기록을 정리한 수의사 검토용 초안이며, 수의사의 확인을 대신하지 않습니다.`,
  keywords:
    "반려동물,강아지,고양이,건강기록,병원공유,진료메모,펫케어,경과기록,예방접종,사진기록",
  marketingUrl: "https://pf-two-eta.vercel.app",
  promotionalText:
    "오늘 관찰한 변화를 짧게 남기고, 병원에 보여줄 건강 흐름과 경과 요약으로 정리해요.",
  supportUrl: "https://pf-two-eta.vercel.app",
};

const appInfoMetadata = {
  subtitle: "반려동물 건강 기록과 병원 공유",
  privacyPolicyUrl: "https://pf-two-eta.vercel.app/privacy",
};

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

const app = await request(`/v1/apps/${appId}`);
const version = await findAppStoreVersion();
const build = await findLatestValidBuild();
await connectBuild(version.id, build.id);
const localization = await findLocalization(version.id);
const updatedLocalization = await updateLocalization(localization.id);
const appInfoLocalization = await findAppInfoLocalization();
const updatedAppInfoLocalization = await updateAppInfoLocalization(appInfoLocalization.id);
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
    },
    null,
    2,
  ),
);
