import path from "node:path";
import {
  assertDistinctScreenshotSets,
  validateStampedScreenshotSet,
} from "./store-screenshot-guard.mjs";

export const GOOGLE_PLAY_SCREENSHOT_FILES = Object.freeze([
  "01-home-score.png",
  "02-health-check.png",
  "03-health-flow.png",
  "04-account-pets.png",
  "05-report-summary.png",
]);

export const GOOGLE_PLAY_FEATURE_GRAPHIC_DEFINITION = Object.freeze({
  relativeDirectory: "store/google-play",
  fileName: "feature-graphic-1024x500.png",
  displayType: "GOOGLE_PLAY_FEATURE_GRAPHIC",
  width: 1024,
  height: 500,
});

export const GOOGLE_PLAY_SCREENSHOT_SET_DEFINITIONS = Object.freeze([
  Object.freeze({
    relativeDirectory: "store/google-play/screenshots-phone",
    displayType: "GOOGLE_PLAY_PHONE",
    width: 1080,
    height: 1920,
    avdName: "PetFlow_Phone_API36",
    density: 420,
    rotation: 0,
  }),
  Object.freeze({
    relativeDirectory: "store/google-play/screenshots-tablet-7",
    displayType: "GOOGLE_PLAY_TABLET_7",
    width: 1350,
    height: 2400,
    avdName: "PetFlow_Tablet7_API36",
    density: 320,
    rotation: 0,
  }),
  Object.freeze({
    relativeDirectory: "store/google-play/screenshots-tablet-10",
    displayType: "GOOGLE_PLAY_TABLET_10",
    width: 1800,
    height: 3200,
    avdName: "PetFlow_Tablet10_API36",
    density: 320,
    rotation: 0,
  }),
]);

export function googlePlayScreenshotSets(mobileRoot) {
  return GOOGLE_PLAY_SCREENSHOT_SET_DEFINITIONS.map((definition) => ({
    ...definition,
    directory: path.join(mobileRoot, ...definition.relativeDirectory.split("/")),
  }));
}

export function googlePlayFeatureGraphic(mobileRoot) {
  return {
    ...GOOGLE_PLAY_FEATURE_GRAPHIC_DEFINITION,
    directory: path.join(
      mobileRoot,
      ...GOOGLE_PLAY_FEATURE_GRAPHIC_DEFINITION.relativeDirectory.split("/"),
    ),
  };
}

export function validateGooglePlayFeatureGraphic(
  mobileRoot,
  { version, buildNumber, gitCommit },
) {
  const asset = googlePlayFeatureGraphic(mobileRoot);
  return validateStampedScreenshotSet({
    directory: asset.directory,
    expected: {
      version,
      buildNumber,
      gitCommit,
      platform: "android",
      displayType: asset.displayType,
      width: asset.width,
      height: asset.height,
      expectedFileNames: [asset.fileName],
    },
  });
}

export function validateGooglePlayScreenshotSets(
  mobileRoot,
  { version, buildNumber, gitCommit },
) {
  const stampedSets = googlePlayScreenshotSets(mobileRoot).map((set) =>
    validateStampedScreenshotSet({
      directory: set.directory,
      expected: {
        version,
        buildNumber,
        gitCommit,
        platform: "android",
        displayType: set.displayType,
        width: set.width,
        height: set.height,
        expectedFileNames: GOOGLE_PLAY_SCREENSHOT_FILES,
      },
    }),
  );
  assertDistinctScreenshotSets(stampedSets);
  return stampedSets;
}
