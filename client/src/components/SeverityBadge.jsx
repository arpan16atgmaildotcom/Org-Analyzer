import { useTheme } from "../ThemeContext";

export default function SeverityBadge({ severity }) {
  const { colors } = useTheme();
  const config = {
    critical: { color: colors.critical, label: "CRITICAL" },
    warning:  { color: colors.warning,  label: "WARNING" },
    info:     { color: colors.info,     label: "INFO" },
    success:  { color: colors.success,  label: "PASS" },
  };
  const c = config[severity] || config.info;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 1.2, padding: "2px 8px",
      borderRadius: 3, background: c.color + "22", color: c.color,
      border: `1px solid ${c.color}55`, fontFamily: "monospace",
    }}>
      {c.label}
    </span>
  );
}
