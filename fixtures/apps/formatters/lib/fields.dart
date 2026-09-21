import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Four fields, each reporting what it holds and how many changes it was told about (a rejected edit is not one).
class Fields extends StatefulWidget {
  const Fields({super.key});

  @override
  State<Fields> createState() => _FieldsState();
}

class _FieldsState extends State<Fields> {
  String digits = '';
  int digitChanges = 0;
  String limited = '';
  String both = '';
  String form = '';

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> digits=[$digits] changes=$digitChanges limited=[$limited] both=[$both] form=[$form]'),
        TextField(
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          onChanged: (String v) => setState(() {
            digits = v;
            digitChanges++;
          }),
        ),
        TextField(
          inputFormatters: [LengthLimitingTextInputFormatter(4)],
          onChanged: (String v) => setState(() => limited = v),
        ),
        TextField(
          inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(3)],
          onChanged: (String v) => setState(() => both = v),
        ),
        TextFormField(
          inputFormatters: [LengthLimitingTextInputFormatter(2)],
          onChanged: (String v) => setState(() => form = v),
        ),
      ],
    );
  }
}
