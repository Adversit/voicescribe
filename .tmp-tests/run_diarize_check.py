from diarization.speaker import SpeakerDiarizer
sp = SpeakerDiarizer()
print('before', sp.runtime_status())
sp.ensure_diarization_loaded()
print('after_load', sp.runtime_status())
segments = sp.diarize(r'..\.tmp-tests\dialog.wav')
print('segment_count', len(segments))
print('segments_head', segments[:10])
