import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPublicScans } from "../api";
import type { PublicScanItem } from "../api";

export const CommunityFeed: React.FC = () => {
  const [scans, setScans] = useState<PublicScanItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPublicScans()
      .then(setScans)
      .catch((err) => console.error("Error fetching community scans:", err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-xl font-semibold text-gray-400">Loading Community Scans...</div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in duration-500">
      <div>
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-400">
          Community APIs
        </h1>
        <p className="text-gray-400 mt-2">
          Explore the best architectures and load test results from developers around the world.
        </p>
      </div>

      {scans.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-white/5 rounded-2xl bg-white/5 backdrop-blur-xl">
          <span className="text-4xl mb-4">🌍</span>
          <h2 className="text-2xl font-bold text-white">No public scans yet</h2>
          <p className="text-gray-400 mt-2 text-center">
            Be the first to publish your API analysis to the community!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scans.map((scan) => (
            <Link
              key={scan.id}
              to={`/apis/${scan.projectName}?scanId=${scan.id}`}
              className="group block p-6 border border-white/10 rounded-2xl bg-white/5 backdrop-blur-xl hover:bg-white/10 transition-all duration-300 hover:-translate-y-1 shadow-lg hover:shadow-indigo-500/20"
            >
              <div className="flex items-center space-x-3 mb-4">
                {scan.ownerPicture ? (
                  <img
                    src={scan.ownerPicture}
                    alt={scan.ownerName}
                    className="w-10 h-10 rounded-full border border-white/20"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                    {scan.ownerName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-300">{scan.ownerName}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(scan.startedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <h2 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">
                {scan.projectName}
              </h2>

              <div className="flex justify-between items-end mt-6">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Health</p>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-2xl font-black ${
                        scan.grade === "A" || scan.grade === "B"
                          ? "text-emerald-400"
                          : scan.grade === "C"
                          ? "text-yellow-400"
                          : "text-red-400"
                      }`}
                    >
                      {scan.grade}
                    </span>
                    <span className="text-sm font-medium text-gray-400">
                      {scan.healthScore}/100
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Endpoints</p>
                  <p className="text-lg font-bold text-white">{scan.totalEndpoints}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
