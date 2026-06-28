'use client'

interface RatingCardProps {
  rating: number
  totalRatings?: number
  size?: 'sm' | 'md' | 'lg'
  showDetails?: boolean
  ratingDetails?: {
    food: number
    service: number
    ambiance: number
    value: number
  }
}

export default function RatingCard({ 
  rating, 
  totalRatings, 
  size = 'md',
  showDetails = false,
  ratingDetails 
}: RatingCardProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-1.5',
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`bg-[#06D6A0] text-white rounded-[20px] font-semibold flex items-center gap-1 ${sizeClasses[size]}`}>
        <i className="fas fa-star text-xs"></i> {rating}
        {totalRatings && <span className="text-xs">({totalRatings}+)</span>}
      </div>

      {showDetails && ratingDetails && (
        <div className="bg-[#F8F9FA] p-4 rounded-xl mt-5">
          <h3 className="text-lg font-bold mb-2.5">Restaurant Ratings</h3>
          <div className="grid grid-cols-4 gap-5 mt-2.5">
            <div className="text-center">
              <div className="text-2xl font-bold text-[#06D6A0]">{ratingDetails.food}</div>
              <div className="text-xs text-[#6C757D]">Food</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#06D6A0]">{ratingDetails.service}</div>
              <div className="text-xs text-[#6C757D]">Service</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#06D6A0]">{ratingDetails.ambiance}</div>
              <div className="text-xs text-[#6C757D]">Ambiance</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-[#06D6A0]">{ratingDetails.value}</div>
              <div className="text-xs text-[#6C757D]">Value</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

