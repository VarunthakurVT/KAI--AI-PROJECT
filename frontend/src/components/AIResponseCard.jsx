import React from 'react';
import './AIResponseCard.css';

/**
 * AIResponseCard Component
 * Displays AI responses in the formatted style shown in the chatbot UI
 * 
 * Props:
 * - greeting: Initial greeting message
 * - heading: Main heading title
 * - headingIcon: Icon for heading (default: 🔗)
 * - content: Main content/explanation
 * - followup: Follow-up question
 * - followupIcon: Icon for follow-up (default: ❓)
 */
export const AIResponseCard = ({
  greeting = "Hello 👋, it's lovely to meet you!",
  heading = "What's on Your Mind?",
  headingIcon = "🔗",
  content = "Is there a specific topic you'd like to explore?",
  followup = "What would you like to learn about?",
  followupIcon = "🤔"
}) => {
  return (
    <div className="ai-response-card">
      <div className="greeting-text">{greeting}</div>
      
      <h1 className="main-heading">
        {heading} <span className="heading-icon">{headingIcon}</span>
      </h1>
      
      <p className="content-text">{content}</p>
      
      <p className="followup-text">
        {followup} <span className="followup-icon">{followupIcon}</span>
      </p>
    </div>
  );
};

/**
 * Example Usage:
 * 
 * <AIResponseCard
 *   greeting="Hello 👋, I'm here to help!"
 *   heading="Understanding Algorithms"
 *   headingIcon="⚙️"
 *   content="Algorithms are step-by-step procedures for solving a problem or completing a task..."
 *   followup="Which algorithm would you like to explore first?"
 *   followupIcon="🎯"
 * />
 */

// Multiple preset responses
export const AIResponsePresets = {
  WELCOME: {
    greeting: "Hello 👋, it's lovely to meet you. I'm here to help you master your course material!",
    heading: "What's on Your Mind?",
    headingIcon: "🔗",
    content: "Is there a specific topic you're struggling with or something you'd like to explore further? I'm all ears and ready to assist you. Please feel free to share your thoughts, and we'll take it from there.",
    followup: "Do you have a particular subject or question in mind that you'd like to discuss today?",
    followupIcon: "😊"
  },
  
  LEARNING_PATH: {
    greeting: "Hello 👋, let's chart your learning journey!",
    heading: "Your Learning Path 📚",
    headingIcon: "🛤️",
    content: "Based on your goals, I've created a personalized learning plan that builds your knowledge step by step.",
    followup: "Which topic would you like to start with first?",
    followupIcon: "🚀"
  },
  
  PRACTICE_PROBLEM: {
    greeting: "Hello 👋, time to practice!",
    heading: "Practice Problem 💪",
    headingIcon: "🎯",
    content: "Here's a challenging problem to strengthen your understanding and test your knowledge.",
    followup: "Do you want hints, the solution, or would you like to try again?",
    followupIcon: "🤔"
  },
  
  EXPLANATION: {
    greeting: "Hello 👋, let me explain this concept!",
    heading: "How This Works ⚙️",
    headingIcon: "🔍",
    content: "Let me break down this concept into easy-to-understand parts.",
    followup: "Would you like more details or examples?",
    followupIcon: "📖"
  },
  
  QUIZ_MODE: {
    greeting: "Hello 👋, let's test your knowledge!",
    heading: "Quiz Time 📝",
    headingIcon: "✅",
    content: "Answer these questions to see how well you've mastered this material.",
    followup: "Ready to begin?",
    followupIcon: "🎓"
  }
};

/**
 * Usage with presets:
 * 
 * <AIResponseCard {...AIResponsePresets.WELCOME} />
 * <AIResponseCard {...AIResponsePresets.PRACTICE_PROBLEM} />
 */

export default AIResponseCard;
