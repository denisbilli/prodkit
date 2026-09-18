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
