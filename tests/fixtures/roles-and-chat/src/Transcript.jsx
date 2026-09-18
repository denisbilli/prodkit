export function Transcript({ messages }) {
  return (
    <ol>
      {messages.map((m) => (
        <li key={m.id}>
          <strong>{m.role === 'user' ? 'You' : 'Assistant'}</strong>
          {m.role === 'assistant' ? <Robot /> : <Person />}
          <p>{m.content}</p>
        </li>
      ))}
    </ol>
  );
}

export function labelFor(role) {
  if (role === 'assistant') {
    return 'Assistant';
  }
  return 'You';
}
