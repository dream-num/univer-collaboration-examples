import { useEffect, useState } from "react";
import { Icon } from "./icons";

export function RefreshNotice() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 10_000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;
  return (
    <div className="au-notifications" aria-label="Notifications">
      <div className="au-notification au-notification-error" role="alert">
        <Icon name="close" />
        <span>Unable to refresh Units. Retrying shortly.</span>
        <button className="au-button au-button-icon" type="button" aria-label="Dismiss notification" onClick={() => setVisible(false)}>
          <Icon name="close" />
        </button>
      </div>
    </div>
  );
}
