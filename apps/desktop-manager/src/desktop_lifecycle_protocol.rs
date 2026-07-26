use std::io::{ErrorKind, Read, Write};

use prost::Message;

pub mod wire {
    include!("generated/job_boardwalk/desktop_lifecycle/v1/job_boardwalk.desktop_lifecycle.v1.rs");
}

const MAXIMUM_FRAME_LENGTH: usize = 1024 * 1024;
const MAXIMUM_LENGTH_PREFIX_BYTES: usize = 5;

fn read_frame_length(reader: &mut impl Read) -> Result<Option<usize>, String> {
    let mut frame_length = 0usize;
    let mut multiplier = 1usize;
    for index in 0..MAXIMUM_LENGTH_PREFIX_BYTES {
        let mut byte = [0u8; 1];
        match reader.read_exact(&mut byte) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::UnexpectedEof && index == 0 => {
                return Ok(None);
            }
            Err(error) if error.kind() == ErrorKind::UnexpectedEof => {
                return Err("Desktop lifecycle channel ended with a truncated frame".to_owned());
            }
            Err(error) => return Err(error.to_string()),
        }
        frame_length += usize::from(byte[0] & 0x7f) * multiplier;
        if byte[0] & 0x80 == 0 {
            if frame_length > MAXIMUM_FRAME_LENGTH {
                return Err(format!(
                    "Desktop lifecycle frame exceeds {MAXIMUM_FRAME_LENGTH} bytes"
                ));
            }
            return Ok(Some(frame_length));
        }
        multiplier *= 128;
    }
    Err("Desktop lifecycle frame has an invalid length prefix".to_owned())
}

fn read_message<MessageType>(reader: &mut impl Read) -> Result<Option<MessageType>, String>
where
    MessageType: Message + Default,
{
    let Some(frame_length) = read_frame_length(reader)? else {
        return Ok(None);
    };
    let mut frame = vec![0u8; frame_length];
    reader.read_exact(&mut frame).map_err(|error| {
        if error.kind() == ErrorKind::UnexpectedEof {
            "Desktop lifecycle channel ended with a truncated frame".to_owned()
        } else {
            error.to_string()
        }
    })?;
    MessageType::decode(frame.as_slice())
        .map(Some)
        .map_err(|error| error.to_string())
}

fn write_message(writer: &mut impl Write, message: &impl Message) -> Result<(), String> {
    let frame = message.encode_length_delimited_to_vec();
    writer
        .write_all(&frame)
        .map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

pub fn read_runtime_message(
    reader: &mut impl Read,
) -> Result<Option<wire::RuntimeMessage>, String> {
    read_message(reader)
}

pub fn runtime_status(message: wire::RuntimeMessage) -> Result<wire::RuntimeStatus, String> {
    if message.protocol_version != wire::ProtocolVersion::V1 as i32 {
        return Err(format!(
            "Unsupported desktop lifecycle protocol version: {}",
            message.protocol_version
        ));
    }
    match message.event {
        Some(wire::runtime_message::Event::Status(status)) => Ok(status),
        None => Err("Desktop lifecycle runtime message has no event".to_owned()),
    }
}

pub fn write_shutdown(writer: &mut impl Write) -> Result<(), String> {
    write_message(
        writer,
        &wire::ManagerMessage {
            protocol_version: wire::ProtocolVersion::V1 as i32,
            command: Some(wire::manager_message::Command::Shutdown(
                wire::ShutdownCommand {},
            )),
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encoded_runtime_message(
        protocol_version: wire::ProtocolVersion,
        event: Option<wire::runtime_message::Event>,
    ) -> Vec<u8> {
        wire::RuntimeMessage {
            protocol_version: protocol_version as i32,
            event,
        }
        .encode_length_delimited_to_vec()
    }

    #[test]
    fn reads_a_versioned_status_event() {
        let encoded = encoded_runtime_message(
            wire::ProtocolVersion::V1,
            Some(wire::runtime_message::Event::Status(wire::RuntimeStatus {
                state: wire::RuntimeState::Running as i32,
                detail: "Synthetic services are ready.".to_owned(),
                log_path: "/synthetic/log".to_owned(),
                dashboard_url: Some("http://127.0.0.1:54311".to_owned()),
                system_browser: Some(wire::SystemBrowserDiagnostic {
                    state: wire::SystemBrowserState::Recognized as i32,
                    detail: "Synthetic Chrome was detected.".to_owned(),
                    family: Some(wire::SystemBrowserFamily::Chrome as i32),
                    version: Some("141.0.0.0".to_owned()),
                }),
            })),
        );
        let mut frame = encoded.as_slice();

        let message = read_runtime_message(&mut frame)
            .expect("representative runtime message should decode")
            .expect("one runtime message should be present");
        let status = runtime_status(message).expect("representative status should be accepted");

        assert_eq!(status.state, wire::RuntimeState::Running as i32);
        assert_eq!(
            status
                .system_browser
                .map(|system_browser| system_browser.state),
            Some(wire::SystemBrowserState::Recognized as i32)
        );
    }

    #[test]
    fn rejects_an_unknown_protocol_version() {
        let message = wire::RuntimeMessage {
            protocol_version: wire::ProtocolVersion::Unspecified as i32,
            event: Some(wire::runtime_message::Event::Status(
                wire::RuntimeStatus::default(),
            )),
        };

        assert!(runtime_status(message).is_err());
    }

    #[test]
    fn rejects_a_missing_event() {
        let message = wire::RuntimeMessage {
            protocol_version: wire::ProtocolVersion::V1 as i32,
            event: None,
        };

        assert!(runtime_status(message).is_err());
    }

    #[test]
    fn rejects_a_truncated_frame() {
        let mut frame = encoded_runtime_message(wire::ProtocolVersion::V1, None);
        frame.pop();

        assert!(read_runtime_message(&mut frame.as_slice()).is_err());
    }

    #[test]
    fn writes_a_versioned_shutdown_command() {
        let mut frame = Vec::new();

        write_shutdown(&mut frame).expect("shutdown command should encode");
        let message = wire::ManagerMessage::decode_length_delimited(frame.as_slice())
            .expect("shutdown command should decode");

        assert_eq!(message.protocol_version, wire::ProtocolVersion::V1 as i32);
        assert!(matches!(
            message.command,
            Some(wire::manager_message::Command::Shutdown(_))
        ));
    }
}
