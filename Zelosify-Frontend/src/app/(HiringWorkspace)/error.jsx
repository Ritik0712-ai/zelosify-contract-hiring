"use client";
export default function Error({reset}){return <div className="hire-error" role="alert"><h1>This workspace could not be displayed.</h1><p>Try loading it again. Your submitted profiles are saved.</p><button className="hire-button" onClick={reset}>Try again</button></div>;}
