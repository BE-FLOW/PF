"use client";

import { Icon, type IconName } from "./icon";

const guideItems: Array<{
  icon: IconName;
  title: string;
  description: string;
}> = [
  {
    icon: "plus",
    title: "짧게 기록",
    description: "달라진 점만 남기고 사진·영상은 필요할 때 더해요.",
  },
  {
    icon: "activity",
    title: "흐름은 자동 연결",
    description: "같은 아이의 기록을 날짜별 경과로 자동 정리해요.",
  },
  {
    icon: "stethoscope",
    title: "병원 갈 때 요약",
    description: "필요한 기간을 골라 병원에 보여줄 자료를 만들어요.",
  },
];

export function QuickGuideDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="quick-guide-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-labelledby="quick-guide-title"
        aria-modal="true"
        className="quick-guide-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="quick-guide-heading">
          <span>처음 사용법</span>
          <h2 id="quick-guide-title">세 가지만 기억하면 돼요</h2>
        </div>

        <ol className="quick-guide-list">
          {guideItems.map((item) => (
            <li key={item.title}>
              <span className="quick-guide-icon" aria-hidden="true">
                <Icon name={item.icon} size={18} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
            </li>
          ))}
        </ol>

        <button autoFocus className="primary-button quick-guide-close" type="button" onClick={onClose}>
          시작하기
        </button>
      </section>
    </div>
  );
}
