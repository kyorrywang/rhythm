import { FormEvent, useState } from "react";

type Props = {
  onSend: (text: string) => Promise<void>;
};

export function Composer({ onSend }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || loading) {
      return;
    }
    setLoading(true);
    try {
      await onSend(value);
      setText("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="输入问题，例如：现在时间是多少？"
      />
      <button type="submit" disabled={loading}>
        {loading ? "发送中..." : "发送"}
      </button>
    </form>
  );
}
