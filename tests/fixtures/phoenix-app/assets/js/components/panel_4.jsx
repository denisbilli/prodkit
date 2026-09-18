import React, { useEffect, useState } from "react";

export function Panel4() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetch("/api/stats/4", { credentials: "include" })
      .then((response) => response.json())
      .then(setRows);
  }, []);

  return <ul>{rows.map((row) => <li key={row.id}>{row.label}</li>)}</ul>;
}
