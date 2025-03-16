import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");

  // Referencia para auto-scroll
  const messagesEndRef = useRef(null);

  // Opciones de configuración
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    model: "gpt-4",
    temperature: 0.7,
    max_tokens: 1000,
    useStreaming: false,
  });

  // Auto-scroll cuando se añaden nuevos mensajes
  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Enviar mensaje normal (sin streaming)
  const sendMessage = async () => {
    if (!input.trim()) return;

    // Limpiar errores anteriores
    setError(null);

    // Añadir mensaje del usuario a la conversación
    const userMessage = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsLoading(true);

    try {
      // Usar el historial de conversación para mantener contexto
      const conversationHistory = updatedMessages.map((msg) => ({
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: msg.content,
      }));

      const response = await axios.post(
        "https://chatbot-backend-vaup.onrender.com/chat",
        {
          message: input,
          conversationHistory: conversationHistory.slice(0, -1), // Excluir el último mensaje (ya incluido en 'message')
          model: settings.model,
          temperature: parseFloat(settings.temperature),
          max_tokens: parseInt(settings.max_tokens),
        }
      );

      // Actualizar mensajes con la respuesta
      setMessages((prevMessages) => [
        ...prevMessages,
        { role: "bot", content: response.data.reply },
      ]);
    } catch (error) {
      console.error("Error al comunicarse con el backend", error);
      setError(
        error.response?.data?.error ||
          "Error al comunicarse con el servidor. Por favor, intenta de nuevo."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Enviar mensaje con streaming
  const sendStreamingMessage = async () => {
    // Validación básica
    if (!input.trim()) return;

    // Preparar estado inicial
    setError(null);
    const userMessage = { role: "user", content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    setIsStreaming(true);
    setStreamingMessage("");

    try {
      // Preparar el historial de conversación
      const conversationHistory = updatedMessages.map((msg) => ({
        role: msg.role === "bot" ? "assistant" : msg.role,
        content: msg.content,
      }));

      // Realizar solicitud de streaming
      const response = await fetch(
        "https://chatbot-backend-vaup.onrender.com/chat/stream",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: input,
            conversationHistory: conversationHistory.slice(0, -1),
            model: settings.model,
            temperature: parseFloat(settings.temperature),
            max_tokens: parseInt(settings.max_tokens),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      // Procesar el stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let completeResponse = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Extraer contenido del chunk
        const lines = chunk
          .split("\n")
          .filter((line) => line.trim().startsWith("data:"));

        for (const line of lines) {
          if (line.includes("[DONE]")) continue;

          try {
            const jsonStr = line.substring(line.indexOf("data:") + 5).trim();
            if (jsonStr) {
              const data = JSON.parse(jsonStr);
              if (data.choices && data.choices[0]?.delta?.content) {
                const newContent = data.choices[0].delta.content;
                completeResponse += newContent;
                setStreamingMessage(completeResponse);
              }
            }
          } catch (e) {
            // Si hay error en el parsing, continuamos con el siguiente chunk
            console.error("Error en chunk:", e);
          }
        }
      }

      // Finalizar la conversación
      if (completeResponse) {
        setMessages((prevMessages) => [
          ...prevMessages,
          { role: "bot", content: completeResponse },
        ]);
      } else {
        throw new Error("No se recibió respuesta del servidor");
      }
    } catch (error) {
      console.error("Error en streaming", error);
      setError(`Error en la comunicación: ${error.message}`);

      // Guardar respuesta parcial si existe
      if (streamingMessage) {
        setMessages((prevMessages) => [
          ...prevMessages,
          { role: "bot", content: streamingMessage },
        ]);
      }
    } finally {
      setIsStreaming(false);
      setStreamingMessage("");
    }
  };

  // Manejar envío de mensajes según configuración
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (settings.useStreaming) {
      sendStreamingMessage();
    } else {
      sendMessage();
    }
  };

  // Manejar cambios en configuración
  const handleSettingChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>Chat con OpenAI</h1>
        <button
          className="settings-toggle"
          onClick={() => setShowSettings(!showSettings)}
        >
          ⚙️ Configuración
        </button>
      </header>

      {/* Panel de configuración */}
      {showSettings && (
        <div className="settings-panel">
          <h3>Configuración</h3>
          <div className="setting-item">
            <label htmlFor="model">Modelo:</label>
            <select
              id="model"
              name="model"
              value={settings.model}
              onChange={handleSettingChange}
            >
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
            </select>
          </div>

          <div className="setting-item">
            <label htmlFor="temperature">Temperatura:</label>
            <input
              type="range"
              id="temperature"
              name="temperature"
              min="0"
              max="1"
              step="0.1"
              value={settings.temperature}
              onChange={handleSettingChange}
            />
            <span>{settings.temperature}</span>
          </div>

          <div className="setting-item">
            <label htmlFor="max_tokens">Máx. tokens:</label>
            <input
              type="number"
              id="max_tokens"
              name="max_tokens"
              min="100"
              max="4000"
              value={settings.max_tokens}
              onChange={handleSettingChange}
            />
          </div>

          <div className="setting-item">
            <label htmlFor="useStreaming">Usar streaming:</label>
            <input
              type="checkbox"
              id="useStreaming"
              name="useStreaming"
              checked={settings.useStreaming}
              onChange={handleSettingChange}
            />
          </div>
        </div>
      )}

      {/* Mensajes de error */}
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError(null)}>Cerrar</button>
        </div>
      )}

      {/* Área de mensajes */}
      <div className="messages-container">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`message ${
              msg.role === "user" ? "user-message" : "bot-message"
            }`}
          >
            <div className="message-content">{msg.content}</div>
          </div>
        ))}

        {/* Mensaje en streaming */}
        {isStreaming && streamingMessage && (
          <div className="message bot-message">
            <div className="message-content">{streamingMessage}</div>
          </div>
        )}

        {/* Indicador de carga */}
        {isLoading && (
          <div className="message bot-message">
            <div className="loading-indicator">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Formulario de entrada */}
      <form className="input-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribe un mensaje..."
          disabled={isLoading || isStreaming}
        />
        <button
          type="submit"
          disabled={isLoading || isStreaming || !input.trim()}
        >
          {isLoading || isStreaming ? "Enviando..." : "Enviar"}
        </button>
      </form>
    </div>
  );
}

export default App;
