import React from 'react';

interface User {
  id: string;
  name: string;
  cursor: { x: number; y: number };
  color: string;
}

interface CollaborativeCursorProps {
  user: User;
}

export const CollaborativeCursor: React.FC<CollaborativeCursorProps> = ({ user }) => {
  return (
    <div
      className="fixed pointer-events-none z-50 transition-all duration-100"
      style={{
        left: user.cursor.x,
        top: user.cursor.y,
        transform: 'translate(-2px, -2px)'
      }}
    >
      {/* Cursor */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        className="drop-shadow-sm"
      >
        <path
          d="M2 2L18 8L8 12L2 18L2 2Z"
          fill={user.color}
          stroke="white"
          strokeWidth="1"
        />
      </svg>
      
      {/* User Label */}
      <div
        className="absolute top-5 left-2 px-2 py-1 rounded text-xs text-white font-medium whitespace-nowrap"
        style={{ backgroundColor: user.color }}
      >
        {user.name}
      </div>
    </div>
  );
};