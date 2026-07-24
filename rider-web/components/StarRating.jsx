"use client";
import { useState } from 'react';
import { FaStar } from 'react-icons/fa';

export default function StarRating({ 
  value = 0, 
  onChange, 
  readOnly = false, 
  size = 'md',
  showLabel = false 
}) {
  const [hoverValue, setHoverValue] = useState(0);

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-3xl'
  };

  const handleClick = (rating) => {
    if (!readOnly && onChange) {
      onChange(rating);
    }
  };

  const handleMouseEnter = (rating) => {
    if (!readOnly) {
      setHoverValue(rating);
    }
  };

  const handleMouseLeave = () => {
    if (!readOnly) {
      setHoverValue(0);
    }
  };

  const displayValue = hoverValue || value;

  return (
    <div className="flex items-center gap-3">
      <div 
        className="flex gap-1"
        onMouseLeave={handleMouseLeave}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => handleClick(star)}
            onMouseEnter={() => handleMouseEnter(star)}
            disabled={readOnly}
            className={`
              ${readOnly ? 'cursor-default' : 'cursor-pointer transition-all duration-200 hover:scale-110'}
              ${sizeClasses[size]}
              transform transition-transform
            `}
            aria-label={`Rate ${star} ${star === 1 ? 'star' : 'stars'}`}
          >
            <FaStar
              className={`
                ${star <= displayValue 
                  ? 'text-yellow-400 fill-yellow-400 drop-shadow-[0_2px_4px_rgba(250,204,21,0.3)]' 
                  : 'text-gray-300 dark:text-gray-600 fill-gray-300 dark:fill-gray-600'
                }
                transition-all duration-200
                ${!readOnly && 'hover:drop-shadow-[0_2px_8px_rgba(250,204,21,0.4)]'}
              `}
            />
          </button>
        ))}
      </div>
      {showLabel && value > 0 && (
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {value.toFixed(1)} {value === 1 ? 'Star' : 'Stars'}
        </span>
      )}
    </div>
  );
}
