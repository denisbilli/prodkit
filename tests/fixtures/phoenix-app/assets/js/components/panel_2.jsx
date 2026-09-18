import React, { useEffect, useState } from "react";

export function Panel2() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch("/api/stats/2", { credentials: "include" })
      .then((response) => response.json())
      .then(setRows);
  }, []);

  return <ul>{rows.map((row) => <li key={row.id}>{row.label}</li>)}</ul>;
}
