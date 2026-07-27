import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  appStoreConnectDefaults,
  createAppStoreConnectClient,
  hasStatus,
  parseArgs,
} from "./lib/app-store-connect.mjs";

const defaults = Object.freeze({
  productId: "petflow_ai_summary_1",
  referenceName: "AI 병원 전달 요약 1회 이용권",
  locale: "ko",
  displayName: "AI 병원 전달 요약 1회",
  description: "보호자 기록을 병원 전달용 사실 중심 요약으로 한 번 정리합니다.",
  reviewNote:
    "사용자가 직접 입력한 반려동물 관찰 기록을 사실 중심의 병원 전달용 AI 초안으로 1회 정리하는 소모성 상품입니다. 진단, 처방 또는 치료 결정을 제공하지 않습니다.",
  territory: "KOR",
  customerPrice: "1900",
  reviewImagePath: path.join(
    "store",
    "app-store",
    "iphone-6-7",
    "05-report-summary.png",
  ),
});

const args = parseArgs();
const apply = args.get("--apply") === "true";
const replaceReviewImage =
  args.get("--replace-review-image") === "true";
const appId = args.get("--app-id") || appStoreConnectDefaults.appId;
const productId = args.get("--product-id") || defaults.productId;
const targetPrice = args.get("--price") || defaults.customerPrice;
const { request } = createAppStoreConnectClient({
  keyId: args.get("--key-id") || appStoreConnectDefaults.keyId,
  issuerId: args.get("--issuer-id") || appStoreConnectDefaults.issuerId,
});

async function findPurchase() {
  const query = new URLSearchParams({
    "filter[productId]": productId,
    limit: "10",
  });
  const response = await request(
    `/v1/apps/${appId}/inAppPurchasesV2?${query.toString()}`,
  );
  return response?.data?.[0] ?? null;
}

async function createPurchase() {
  return request("/v2/inAppPurchases", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "inAppPurchases",
        attributes: {
          name: defaults.referenceName,
          productId,
          inAppPurchaseType: "CONSUMABLE",
          reviewNote: defaults.reviewNote,
        },
        relationships: {
          app: {
            data: {
              type: "apps",
              id: appId,
            },
          },
        },
      },
    }),
  });
}

async function getAvailability(purchaseId) {
  try {
    return await request(
      `/v2/inAppPurchases/${purchaseId}/inAppPurchaseAvailability`,
    );
  } catch (error) {
    if (hasStatus(error, 404)) return null;
    throw error;
  }
}

async function createAvailability(purchaseId) {
  const territories = await request("/v1/territories?limit=200");
  const availableTerritories = (territories?.data ?? []).map((territory) => ({
    type: "territories",
    id: territory.id,
  }));
  if (availableTerritories.length === 0) {
    throw new Error("App Store territories could not be loaded.");
  }

  return request("/v1/inAppPurchaseAvailabilities", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "inAppPurchaseAvailabilities",
        attributes: {
          availableInNewTerritories: true,
        },
        relationships: {
          inAppPurchase: {
            data: {
              type: "inAppPurchases",
              id: purchaseId,
            },
          },
          availableTerritories: {
            data: availableTerritories,
          },
        },
      },
    }),
  });
}

async function getVersions(purchaseId) {
  const response = await request(
    `/v2/inAppPurchases/${purchaseId}/versions?limit=50`,
  );
  return response?.data ?? [];
}

async function createVersion(purchaseId) {
  return request("/v1/inAppPurchaseVersions", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "inAppPurchaseVersions",
        relationships: {
          inAppPurchase: {
            data: {
              type: "inAppPurchases",
              id: purchaseId,
            },
          },
        },
      },
    }),
  });
}

async function getLocalizations(versionId) {
  const response = await request(
    `/v1/inAppPurchaseVersions/${versionId}/localizations?limit=50`,
  );
  return response?.data ?? [];
}

async function createLocalization(versionId) {
  return request("/v2/inAppPurchaseLocalizations", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "inAppPurchaseLocalizations",
        attributes: {
          locale: defaults.locale,
          name: defaults.displayName,
          description: defaults.description,
        },
        relationships: {
          version: {
            data: {
              type: "inAppPurchaseVersions",
              id: versionId,
            },
          },
        },
      },
    }),
  });
}

async function getProductImages(versionId) {
  const response = await request(
    `/v1/inAppPurchaseVersions/${versionId}/images?limit=50`,
  );
  return response?.data ?? [];
}

async function uploadOperation(operation, data) {
  const headers = {};
  for (const header of operation.requestHeaders ?? []) {
    if (header.name && header.value) headers[header.name] = header.value;
  }
  const offset = Number(operation.offset);
  const length = Number(operation.length);
  const response = await fetch(operation.url, {
    method: operation.method,
    headers,
    body: data.subarray(offset, offset + length),
  });
  if (!response.ok) {
    throw new Error(
      `Review image upload failed: ${response.status} ${response.statusText}`,
    );
  }
}

async function getReviewScreenshot(purchaseId) {
  try {
    const response = await request(
      `/v2/inAppPurchases/${purchaseId}/appStoreReviewScreenshot`,
    );
    return response?.data ?? null;
  } catch (error) {
    if (hasStatus(error, 404)) return null;
    throw error;
  }
}

async function createReviewScreenshot(purchaseId, filePath) {
  const data = fs.readFileSync(filePath);
  const reservation = await request(
    "/v1/inAppPurchaseAppStoreReviewScreenshots",
    {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "inAppPurchaseAppStoreReviewScreenshots",
        attributes: {
          fileName: path.basename(filePath),
          fileSize: data.length,
        },
        relationships: {
          inAppPurchaseV2: {
            data: {
              type: "inAppPurchases",
              id: purchaseId,
            },
          },
        },
      },
    }),
    },
  );
  const screenshot = reservation.data;
  for (const operation of screenshot.attributes?.uploadOperations ?? []) {
    await uploadOperation(operation, data);
  }
  const checksum = crypto.createHash("md5").update(data).digest("hex");
  await request(`/v1/inAppPurchaseAppStoreReviewScreenshots/${screenshot.id}`, {
    method: "PATCH",
    body: JSON.stringify({
      data: {
        type: "inAppPurchaseAppStoreReviewScreenshots",
        id: screenshot.id,
        attributes: {
          sourceFileChecksum: checksum,
          uploaded: true,
        },
      },
    }),
  });
  return screenshot;
}

function reviewImagePath() {
  const filePath = path.resolve(
    args.get("--review-image") || defaults.reviewImagePath,
  );
  if (!fs.existsSync(filePath)) {
    throw new Error(`Review image not found: ${filePath}`);
  }
  return filePath;
}

async function deleteReviewScreenshot(screenshotId) {
  await request(
    `/v1/inAppPurchaseAppStoreReviewScreenshots/${screenshotId}`,
    { method: "DELETE" },
  );
}

async function getManualPrices(purchaseId) {
  const response = await request(
    `/v1/inAppPurchasePriceSchedules/${purchaseId}/manualPrices?limit=50`,
  );
  return response?.data ?? [];
}

async function findPricePoint(purchaseId) {
  const query = new URLSearchParams({
    "filter[territory]": defaults.territory,
    include: "territory",
    limit: "200",
  });
  const response = await request(
    `/v2/inAppPurchases/${purchaseId}/pricePoints?${query.toString()}`,
  );
  const points = response?.data ?? [];
  return (
    points.find(
      (point) => String(point.attributes?.customerPrice) === String(targetPrice),
    ) ?? null
  );
}

async function createPriceSchedule(purchaseId, pricePointId) {
  const priceId = "${price1}";
  return request("/v1/inAppPurchasePriceSchedules", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "inAppPurchasePriceSchedules",
        relationships: {
          inAppPurchase: {
            data: {
              type: "inAppPurchases",
              id: purchaseId,
            },
          },
          manualPrices: {
            data: [
              {
                type: "inAppPurchasePrices",
                id: priceId,
              },
            ],
          },
          baseTerritory: {
            data: {
              type: "territories",
              id: defaults.territory,
            },
          },
        },
      },
      included: [
        {
          type: "inAppPurchasePrices",
          id: priceId,
          attributes: {
            startDate: null,
          },
          relationships: {
            inAppPurchaseV2: {
              data: {
                type: "inAppPurchases",
                id: purchaseId,
              },
            },
            inAppPurchasePricePoint: {
              data: {
                type: "inAppPurchasePricePoints",
                id: pricePointId,
              },
            },
          },
        },
      ],
    }),
  });
}

let purchase = await findPurchase();
const actions = [];

if (!purchase) {
  actions.push("create_purchase");
  if (apply) {
    purchase = (await createPurchase()).data;
  }
}

if (!purchase) {
  console.log(
    JSON.stringify(
      {
        apply,
        appId,
        productId,
        targetPrice: `${targetPrice} KRW`,
        actions,
        message: "Dry run only. Re-run with --apply to create the product.",
      },
      null,
      2,
    ),
  );
} else {
  const purchaseId = purchase.id;
  const availability = await getAvailability(purchaseId);
  if (!availability) {
    actions.push("enable_all_territories");
    if (apply) await createAvailability(purchaseId);
  }

  const versions = await getVersions(purchaseId);
  let version =
    versions.find(
      (item) => item.attributes?.state === "PREPARE_FOR_SUBMISSION",
    ) ?? versions[0];
  if (!version) {
    actions.push("create_metadata_version");
    if (apply) version = (await createVersion(purchaseId)).data;
  }

  const localizations = version ? await getLocalizations(version.id) : [];
  const hasKoreanLocalization = localizations.some(
    (item) => item.attributes?.locale === defaults.locale,
  );

  if (!hasKoreanLocalization) {
    actions.push("create_ko_kr_localization");
    if (apply) {
      if (!version) throw new Error("In-app purchase version was not created.");
      await createLocalization(version.id);
    }
  }

  const productImages = version ? await getProductImages(version.id) : [];
  const failedProductImages = productImages.filter(
    (image) => image.attributes?.assetDeliveryState?.state === "FAILED",
  );
  if (failedProductImages.length > 0) {
    actions.push("delete_failed_product_image");
    if (apply) {
      for (const image of failedProductImages) {
        await request(`/v2/inAppPurchaseImages/${image.id}`, {
          method: "DELETE",
        });
      }
    }
  }

  const reviewScreenshot = await getReviewScreenshot(purchaseId);
  if (!reviewScreenshot) {
    actions.push("upload_review_screenshot");
    if (apply) {
      await createReviewScreenshot(purchaseId, reviewImagePath());
    }
  } else if (replaceReviewImage) {
    actions.push("replace_review_screenshot");
    if (apply) {
      await deleteReviewScreenshot(reviewScreenshot.id);
      await createReviewScreenshot(purchaseId, reviewImagePath());
    }
  }

  const manualPrices = await getManualPrices(purchaseId);
  if (manualPrices.length === 0) {
    actions.push("set_initial_price");
    if (apply) {
      const pricePoint = await findPricePoint(purchaseId);
      if (!pricePoint) {
        throw new Error(
          `No ${targetPrice} KRW price point is available for ${productId}.`,
        );
      }
      await createPriceSchedule(purchaseId, pricePoint.id);
    }
  }

  const refreshed = apply ? await findPurchase() : purchase;
  console.log(
    JSON.stringify(
      {
        apply,
        appId,
        productId,
        purchaseId,
        versionId: version?.id ?? null,
        type: refreshed?.attributes?.inAppPurchaseType ?? null,
        state: refreshed?.attributes?.state ?? null,
        targetPrice: `${targetPrice} KRW`,
        localization: defaults.locale,
        actions,
        remainingManualStep:
          "Paid Apps 계약을 확인하고, RevenueCat 연결과 새 빌드가 끝나면 이 상품을 다음 앱 심사에 함께 제출하세요.",
      },
      null,
      2,
    ),
  );
}
