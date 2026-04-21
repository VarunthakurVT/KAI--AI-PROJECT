/**
 * KAI Frontend – MCP Adapter Integration Examples
 *
 * This file demonstrates how to use MCP adapters in React components.
 * Examples include calendar integration, email sending, etc.
 */

// ╔══════════════════════════════════════════════╗
// ║  Example 1: Calendar Availability Check      ║
// ╚══════════════════════════════════════════════╝

import { useState } from 'react';
import { checkCalendarAvailability, bookCalendarEvent, CalendarEvent } from './mcpApi';

export function CalendarAvailabilityChecker() {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [availability, setAvailability] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckAvailability = async () => {
    if (!selectedDate) {
      setError('Please select a date');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await checkCalendarAvailability(selectedDate, 'current_user_id');
      setAvailability(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check availability');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h2>Check Calendar Availability</h2>
      
      <div style={{ marginBottom: '15px' }}>
        <label htmlFor="date-picker">Select Date:</label>
        <input
          id="date-picker"
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          style={{ marginLeft: '10px', padding: '8px' }}
        />
      </div>

      <button
        onClick={handleCheckAvailability}
        disabled={loading}
        style={{
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Checking...' : 'Check Availability'}
      </button>

      {error && <div style={{ color: 'red', marginTop: '10px' }}>{error}</div>}

      {availability && (
        <div style={{ marginTop: '20px', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
          <h3>Available Slots for {availability.date}:</h3>
          {availability.available_slots?.length > 0 ? (
            <ul>
              {availability.available_slots.map((slot: any, idx: number) => (
                <li key={idx}>
                  {slot.start_time} - {slot.end_time} ({slot.duration_minutes} min)
                </li>
              ))}
            </ul>
          ) : (
            <p>No available slots</p>
          )}
        </div>
      )}
    </div>
  );
}

// ╔══════════════════════════════════════════════╗
// ║  Example 2: Book Calendar Event              ║
// ╚══════════════════════════════════════════════╝

export function BookEventForm() {
  const [formData, setFormData] = useState({
    title: '',
    start_time: '',
    end_time: '',
    duration_minutes: 60,
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const event = await bookCalendarEvent(
        {
          title: formData.title,
          start_time: formData.start_time,
          end_time: formData.end_time,
          duration_minutes: formData.duration_minutes,
          description: formData.description,
        },
        'current_user_id'
      );
      setSuccess(`Event "${event.title}" booked successfully!`);
      setFormData({ title: '', start_time: '', end_time: '', duration_minutes: 60, description: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to book event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', maxWidth: '500px' }}>
      <h2>Book Calendar Event</h2>
      
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label>Event Title:</label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Start Time:</label>
          <input
            type="datetime-local"
            name="start_time"
            value={formData.start_time}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>End Time:</label>
          <input
            type="datetime-local"
            name="end_time"
            value={formData.end_time}
            onChange={handleChange}
            required
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Duration (minutes):</label>
          <input
            type="number"
            name="duration_minutes"
            value={formData.duration_minutes}
            onChange={handleChange}
            style={{ width: '100%', padding: '8px', marginTop: '5px' }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label>Description:</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            style={{ width: '100%', padding: '8px', marginTop: '5px', minHeight: '80px' }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 20px',
            backgroundColor: '#28a745',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            width: '100%',
          }}
        >
          {loading ? 'Booking...' : 'Book Event'}
        </button>
      </form>

      {error && <div style={{ color: 'red', marginTop: '10px' }}>{error}</div>}
      {success && <div style={{ color: 'green', marginTop: '10px' }}>{success}</div>}
    </div>
  );
}

// ╔══════════════════════════════════════════════╗
// ║  Example 3: Generic MCP Adapter Caller       ║
// ╚══════════════════════════════════════════════╝

import { callMCPAdapter } from './mcpApi';

export function GenericMCPCaller() {
  const [adapter, setAdapter] = useState('calendar');
  const [action, setAction] = useState('check_availability');
  const [payload, setPayload] = useState('{}');
  const [response, setResponse] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCall = async () => {
    setLoading(true);
    setError(null);

    try {
      const parsedPayload = JSON.parse(payload);
      const result = await callMCPAdapter(adapter, action, parsedPayload);
      setResponse(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to call adapter');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h2>Generic MCP Adapter Caller</h2>

      <div style={{ marginBottom: '15px' }}>
        <label>Adapter:</label>
        <input
          type="text"
          value={adapter}
          onChange={(e) => setAdapter(e.target.value)}
          placeholder="e.g., calendar, email, slack"
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Action:</label>
        <input
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="e.g., check_availability, send_message"
          style={{ width: '100%', padding: '8px', marginTop: '5px' }}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
        <label>Payload (JSON):</label>
        <textarea
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          style={{ width: '100%', padding: '8px', marginTop: '5px', minHeight: '120px', fontFamily: 'monospace' }}
        />
      </div>

      <button
        onClick={handleCall}
        disabled={loading}
        style={{
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Calling...' : 'Call Adapter'}
      </button>

      {error && <div style={{ color: 'red', marginTop: '10px' }}>Error: {error}</div>}

      {response && (
        <div style={{ marginTop: '20px', backgroundColor: '#f5f5f5', padding: '10px', borderRadius: '4px' }}>
          <h3>Response:</h3>
          <pre style={{ overflow: 'auto', maxHeight: '300px' }}>
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
