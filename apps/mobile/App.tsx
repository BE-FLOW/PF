import { StatusBar } from "react-native";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const steps = [
  "로그인과 세션 유지",
  "반려동물 등록",
  "오늘 건강 기록",
  "사진·동영상 첨부",
  "병원 공유와 경과 기록",
];

export default function App() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>MOBILE PREP</Text>
        </View>

        <Text style={styles.title}>PetFlow 앱 준비 중</Text>
        <Text style={styles.description}>
          보호자의 관찰을 짧게 남기고, 병원에 전달하기 좋은 흐름으로 정리하는
          모바일 앱을 준비하고 있어요.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>먼저 만들 기능</Text>
          {steps.map((step, index) => (
            <View key={step} style={styles.stepRow}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity activeOpacity={0.85} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>오늘 기록 화면부터 만들기</Text>
        </TouchableOpacity>

        <Text style={styles.notice}>
          AI 리포트와 비밀키는 앱이 아니라 서버에서만 관리합니다.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const colors = {
  background: "#f2faeb",
  card: "#ffffff",
  green: "#1f936f",
  greenSoft: "#e3f5ec",
  ink: "#11352d",
  muted: "#6a7d75",
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 40,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  badgeText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  title: {
    marginTop: 22,
    color: colors.ink,
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 39,
  },
  description: {
    marginTop: 12,
    color: colors.muted,
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
  card: {
    marginTop: 28,
    borderRadius: 28,
    backgroundColor: colors.card,
    padding: 20,
    shadowColor: "#0a3027",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  cardTitle: {
    marginBottom: 14,
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  stepNumber: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: colors.greenSoft,
  },
  stepNumberText: {
    color: colors.green,
    fontSize: 14,
    fontWeight: "900",
  },
  stepText: {
    flex: 1,
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800",
  },
  primaryButton: {
    marginTop: 24,
    alignItems: "center",
    borderRadius: 20,
    backgroundColor: colors.green,
    paddingVertical: 17,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  notice: {
    marginTop: 18,
    color: colors.muted,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    textAlign: "center",
  },
});
