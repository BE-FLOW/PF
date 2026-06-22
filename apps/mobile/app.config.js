const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "https://pf-two-eta.vercel.app";

module.exports = {
  expo: {
    name: "PetFlow",
    slug: "petflow-mobile",
    description: "보호자 관찰을 병원에 전달하기 좋은 흐름으로 정리하는 PetFlow 모바일 앱",
    scheme: "petflow",
    version: "0.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#f2faeb",
    },
    plugins: [
      [
        "expo-image-picker",
        {
          cameraPermission: false,
          microphonePermission: false,
          photosPermission:
            "반려동물 건강 기록에 보호자가 선택한 사진과 영상을 첨부하기 위해 사진 보관함 접근 권한을 사용합니다.",
        },
      ],
    ],
    ios: {
      bundleIdentifier: "com.beflow.petflow",
      buildNumber: "1",
      supportsTablet: false,
    },
    android: {
      package: "com.beflow.petflow",
      versionCode: 1,
      blockedPermissions: ["android.permission.RECORD_AUDIO"],
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#f2faeb",
      },
      permissions: [],
    },
    extra: {
      apiBaseUrl,
    },
  },
};
