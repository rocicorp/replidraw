import { Data } from "./data";
import styles from "./cursor.module.css";
import { useEffect, useState } from "react";

const hideCursorDelay = 5 * 1000;

export function Cursor({ data, clientID }: { data: Data; clientID: string }) {
  const clientState = data.useClientState(clientID);
  const serverNow = dateStringToMs(data.useServerTime());
  const [nowMap, setNowMap] = useState<{ server?: number; client: number }>({
    client: Date.now(),
  });
  const [, setPoke] = useState({});

  if (serverNow != nowMap.server) {
    setNowMap({
      server: serverNow,
      client: Date.now(),
    });
  }

  const serverLastModified =
    clientState && dateStringToMs(clientState.serverLastModified);
  const serverExpires =
    serverLastModified && serverLastModified + hideCursorDelay;

  const clientAheadBy = nowMap.server && nowMap.client - nowMap.server;
  const clientExpires =
    serverExpires && clientAheadBy && serverExpires + clientAheadBy;

  const remaining = clientExpires && clientExpires - Date.now();
  const visible = remaining && remaining > 0;
  console.log(
    `Cursor: ${clientID} - visible: ${visible}, remaining: ${remaining}`
  );

  useEffect(() => {
    if (visible) {
      const timerID = setTimeout(() => setPoke({}), remaining as number); // remaining must be number because visible is non-null
      return () => clearTimeout(timerID);
    }
  });

  if (!clientState || !visible) {
    return null;
  }

  const { cursor, userInfo } = clientState;

  return (
    <div className={styles.cursor} style={{ left: cursor.x, top: cursor.y }}>
      <div className={styles.pointer} style={{ color: userInfo.color }}>
        ➤
      </div>
      <div
        className={styles.userinfo}
        style={{
          backgroundColor: userInfo.color,
          color: "white",
        }}
      >
        {userInfo.avatar}&nbsp;&nbsp;{userInfo.name}
      </div>
    </div>
  );
}

function dateStringToMs(s: string | undefined) {
  if (!s) {
    return undefined;
  }
  const d = Date.parse(s);
  if (isNaN(d)) {
    return undefined;
  }
  return d;
}
