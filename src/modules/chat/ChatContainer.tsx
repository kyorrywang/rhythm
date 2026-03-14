import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAppStore } from '../../app/store';
import { streamChat } from '../../bridge/sse_client';
import { fetchSessionHistory, fetchGlobalConfig } from '../../bridge/api';
import { ActivityTimeline } from './ActivityTimeline';
import { Send } from 'lucide-react';

export const ChatContainer: React.FC = () => {
  const { workspacePath, currentSessionId, setActiveTab } = useAppStore();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState('');
  const streamBufferRef = React.useRef(''); // Use Ref to avoid stale closure
  const [currentMetadata, setCurrentMetadata] = useState<any>(null);
  
  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false);

  useEffect(() => {
    if (currentSessionId && workspacePath) {
      loadHistory();
    } else {
      setMessages([]);
    }
  }, [currentSessionId, workspacePath]);

  const loadHistory = async () => {
    try {
      const history = await fetchSessionHistory(workspacePath, currentSessionId!);
      // Filter out system prompts from UI
      setMessages(history.filter((m: any) => m.role !== 'system'));
    } catch (e) {
      console.error('Failed to load history', e);
    }
  };

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setUserHasScrolledUp(!isAtBottom);
  };

  const scrollToBottom = (force = false) => {
    if (!userHasScrolledUp || force) {
      endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamBuffer]);

  const handleSend = async () => {
    if (!inputValue.trim() || isStreaming || !currentSessionId) return;

    // Check LLM settings
    const config = await fetchGlobalConfig();
    if (!config?.llm?.key) {
      alert("Please set your LLM API Key in Settings first.");
      setActiveTab('settings');
      return;
    }

    const userMsg = { role: 'user', content: inputValue.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsStreaming(true);
    setStreamBuffer('');
    streamBufferRef.current = ''; // Reset ref
    setCurrentMetadata(null);
    setUserHasScrolledUp(false); // reset scroll lock on new send
    
    // Force scroll immediately
    setTimeout(() => scrollToBottom(true), 50);

    await streamChat(
      { sessionId: currentSessionId, message: userMsg.content, workspacePath },
      (chunk) => {
        streamBufferRef.current += chunk; // Update ref immediately
        setStreamBuffer(streamBufferRef.current); // Update UI
      },
      (meta) => {
        setCurrentMetadata(meta);
      },
      () => {
        setIsStreaming(false);
        const finalContent = streamBufferRef.current; // Get latest content from ref
        setMessages(prev => {
          const newMsg = { role: 'assistant', content: finalContent };
          // If there were tools, we attach them conceptually
          if (currentMetadata?.used_tools) {
            (newMsg as any)._toolCalls = currentMetadata.used_tools;
          }
          return [...prev, newMsg];
        });
        setStreamBuffer('');
        streamBufferRef.current = '';
        setCurrentMetadata(null);
      },
      (err) => {
        console.error(err);
        setIsStreaming(false);
        setMessages(prev => [
          ...prev, 
          { role: 'assistant', content: `**Error:** ${err}\n\n*If you see an EOF error, the API might not support standard chat formats or the URL/Key is incorrect.*` }
        ]);
      }
    );
  };

  if (!currentSessionId) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        <h2>Select or create a session to start</h2>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      height: '100%',
      backgroundColor: 'var(--bg-chat)',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}>
      {/* Messages Area */}
      <div 
        ref={chatContainerRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: 'auto', padding: '20px 40px', display: 'flex', flexDirection: 'column', gap: '24px' }}
      >
        {messages.map((msg, idx) => {
          if (msg.role === 'tool') return null; // We hide raw tool responses, they are part of timeline
          if (msg.role === 'assistant' && !msg.content && msg.tool_calls) {
            // This is an intermediate thought/tool execution message from history
            return <ActivityTimeline key={idx} tools={msg.tool_calls} historyMode={true} />;
          }
          
          const isUser = msg.role === 'user';
          return (
            <div key={idx} style={{
              alignSelf: isUser ? 'flex-end' : 'flex-start',
              maxWidth: '80%',
              backgroundColor: isUser ? 'var(--bg-active)' : 'transparent',
              padding: isUser ? '12px 16px' : '0',
              borderRadius: '8px',
              border: isUser ? '1px solid var(--border-color)' : 'none'
            }}>
              {msg._toolCalls && <ActivityTimeline tools={msg._toolCalls} historyMode={true} />}
              {isUser ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
              ) : (
                <div className="markdown-body" style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}

        {/* Streaming State */}
        {isStreaming && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '80%' }}>
            {currentMetadata?.used_tools && (
              <ActivityTimeline tools={currentMetadata.used_tools} historyMode={false} />
            )}
            {!currentMetadata && !streamBuffer && (
              <ActivityTimeline isLoading={true} />
            )}
            {streamBuffer && (
               <div className="markdown-body" style={{ color: 'var(--text-primary)', lineHeight: 1.6 }}>
                 <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamBuffer}</ReactMarkdown>
               </div>
            )}
          </div>
        )}
        <div ref={endOfMessagesRef} />
      </div>
      
      {/* Input Area */}
      <div style={{ padding: '20px 40px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{
          display: 'flex',
          backgroundColor: 'var(--bg-hover)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          alignItems: 'flex-end'
        }}>
          <textarea 
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask Rhythm or press Enter to send..."
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              padding: '16px',
              fontSize: '14px',
              resize: 'none',
              outline: 'none',
              minHeight: '24px',
              maxHeight: '200px',
              fontFamily: 'inherit'
            }}
            rows={1}
          />
          <button 
            onClick={handleSend}
            disabled={!inputValue.trim() || isStreaming}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: inputValue.trim() && !isStreaming ? 'var(--accent-color)' : 'var(--text-secondary)',
              padding: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s'
            }}
          >
            <Send size={20} />
          </button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', textAlign: 'center' }}>
          Shift + Enter for new line. AI can make mistakes.
        </div>
      </div>
    </div>
  );
};
