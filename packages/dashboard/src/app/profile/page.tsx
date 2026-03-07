'use client';

import { useState, useEffect } from 'react';

interface ProfileData {
  name: string;
  location: string;
  profession: string;
  hobbies: string[];
  bio: string;
  social_twitter: string;
  social_linkedin: string;
  social_github: string;
  social_instagram: string;
  social_facebook: string;
}

const emptyProfile: ProfileData = {
  name: '',
  location: '',
  profession: '',
  hobbies: [],
  bio: '',
  social_twitter: '',
  social_linkedin: '',
  social_github: '',
  social_instagram: '',
  social_facebook: '',
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData>(emptyProfile);
  const [hobbyInput, setHobbyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/profile')
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          setProfile({
            name: data.name ?? '',
            location: data.location ?? '',
            profession: data.profession ?? '',
            hobbies: data.hobbies ?? [],
            bio: data.bio ?? '',
            social_twitter: data.social_twitter ?? '',
            social_linkedin: data.social_linkedin ?? '',
            social_github: data.social_github ?? '',
            social_instagram: data.social_instagram ?? '',
            social_facebook: data.social_facebook ?? '',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // keep current state
    } finally {
      setSaving(false);
    }
  };

  const addHobby = () => {
    const trimmed = hobbyInput.trim();
    if (trimmed && !profile.hobbies.includes(trimmed)) {
      setProfile((p) => ({ ...p, hobbies: [...p.hobbies, trimmed] }));
      setHobbyInput('');
    }
  };

  const removeHobby = (hobby: string) => {
    setProfile((p) => ({ ...p, hobbies: p.hobbies.filter((h) => h !== hobby) }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold mb-6">Profile</h2>

      <div className="space-y-6">
        {/* Basic Info */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-zinc-300">Basic Info</h3>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Name</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              placeholder="Your name"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Location</label>
            <input
              type="text"
              value={profile.location}
              onChange={(e) => setProfile((p) => ({ ...p, location: e.target.value }))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              placeholder="City, State"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Profession</label>
            <input
              type="text"
              value={profile.profession}
              onChange={(e) => setProfile((p) => ({ ...p, profession: e.target.value }))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              placeholder="What you do"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">Bio</label>
            <textarea
              value={profile.bio}
              onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600 min-h-[80px]"
              placeholder="A short bio about yourself"
            />
          </div>
        </section>

        {/* Hobbies */}
        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-zinc-300">Hobbies</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={hobbyInput}
              onChange={(e) => setHobbyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addHobby()}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
              placeholder="Add a hobby"
            />
            <button
              onClick={addHobby}
              className="bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.hobbies.map((hobby) => (
              <span
                key={hobby}
                className="bg-zinc-800 text-zinc-300 px-3 py-1 rounded-full text-sm flex items-center gap-2"
              >
                {hobby}
                <button
                  onClick={() => removeHobby(hobby)}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        </section>

        {/* Social */}
        <section className="space-y-4">
          <h3 className="text-lg font-semibold text-zinc-300">Social</h3>
          {[
            { key: 'social_twitter' as const, label: 'Twitter / X', placeholder: '@handle' },
            { key: 'social_linkedin' as const, label: 'LinkedIn', placeholder: 'linkedin.com/in/...' },
            { key: 'social_github' as const, label: 'GitHub', placeholder: 'github.com/...' },
            { key: 'social_instagram' as const, label: 'Instagram', placeholder: '@handle' },
            { key: 'social_facebook' as const, label: 'Facebook', placeholder: 'facebook.com/...' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-sm text-zinc-400 mb-1">{label}</label>
              <input
                type="text"
                value={profile[key]}
                onChange={(e) => setProfile((p) => ({ ...p, [key]: e.target.value }))}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-600"
                placeholder={placeholder}
              />
            </div>
          ))}
        </section>

        {/* Save */}
        <div className="flex items-center gap-3 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
          {saved && <span className="text-green-400 text-sm">Saved!</span>}
        </div>
      </div>
    </div>
  );
}
