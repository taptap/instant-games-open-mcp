import { parse } from 'protobufjs';

// Wire-compatible subset of UrhoX Entrance.proto and TSLobbyServer.proto.
// Unused fields (including returned login credentials) are deliberately not decoded.
const root = parse(`
syntax = "proto2";
message Header {
  required int32 message_type = 1;
  required bytes message_body = 2;
  optional int64 user_id = 3;
  optional int64 login_id = 10;
}
message Login {
  required bytes user_name = 1;
  required bytes user_passwd = 2;
  optional int32 device_type = 4;
  optional int32 login_way = 6;
  optional string token = 7;
  optional string clientid = 14;
  optional string tag = 17;
  optional bool is_rnd = 18;
  optional bool is_silence = 19;
}
message LoginResult { required int32 result_code = 1; }
message Lobby {
  required int32 request_id = 1;
  optional bytes message_body = 2;
}
message Create {
  required string map_name = 1;
  required int32 player_count = 2;
  optional bytes mode_args = 3;
  optional string tag = 7;
}
message ConnectInfo {
  optional int32 ws_port = 10;
  optional string pod_ip = 11;
}
message Created {
  required int32 error_code = 1;
  optional ConnectInfo connect_info = 2;
}
`).root;

export const previewWire = {
  header: root.lookupType('Header'),
  login: root.lookupType('Login'),
  loginResult: root.lookupType('LoginResult'),
  lobby: root.lookupType('Lobby'),
  create: root.lookupType('Create'),
  created: root.lookupType('Created'),
};
