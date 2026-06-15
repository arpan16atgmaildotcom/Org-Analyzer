import { useTheme } from "../ThemeContext";

export default function ProgressBar({ value, max, color }) {
  const { colors } = useTheme();
  const barColor = color || colors.accent;
  return (
    <div style={{ background: colors.highlight, borderRadius: 4, height: 6, overflow: "hidden", flex: 1 }}>
      <div style={{
        width: `${(value / max) * 100}%`, height: "100%",
        background: barColor, borderRadius: 4, transition: "width 1s ease",
      }} />
    </div>
  );
}
